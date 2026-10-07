// Bookmarklet template for the LinkedIn Power Search tool (LinkedinScriptPage.jsx).
// Sibling to naukriScriptTemplate.js, but LinkedIn has no comparably open public
// search API — this scrapes the rendered job-card DOM on linkedin.com/jobs/search/
// instead of replaying a captured fetch. It is intentionally read-only (no
// auto-apply, no messaging, no background polling) and manually paced: you
// click "Next Search" once per page, LinkedIn navigates like a normal click,
// and a soft session counter nudges you to take a break after a few searches —
// none of this calls LinkedIn's internal API or automates account actions,
// which is what actually gets accounts flagged.
export const LINKEDIN_TEMPLATE = `(async () => {
  const CONFIG = {
    storageKey: "hireradar.linkedinPowerSearch.jobs.v1",
    progressKey: "hireradar.linkedinPowerSearch.progress.v1",
    sessionCountKey: "hireradar.linkedinPowerSearch.sessionCount.v1",

    maxAgeHours: __MAX_AGE_HOURS__,
    minScore: __MIN_SCORE__,
    sessionSoftCap: __SESSION_SOFT_CAP__,

    timeFilter: __TIME_FILTER__,
    experienceLevels: __EXPERIENCE_LEVELS__,

    roles: __ROLES__,

    locations: __LOCATIONS__,

    excludedCompanies: __EXCLUDED_COMPANIES__
  };

  // ============================================================
  // ROLE RULES
  // ============================================================

  const REJECT_TITLE_PATTERNS = [
    /\\bdata scientist\\b/i,
    /\\bdata analyst\\b/i,
    /\\bdata engineer\\b/i,

    /\\bproduct manager\\b/i,
    /\\bprogram manager\\b/i,
    /\\bproject manager\\b/i,

    /\\bchief technology officer\\b/i,
    /\\bcto\\b/i,
    /\\bvice president\\b/i,
    /\\bvp\\b/i,

    /\\bengineering manager\\b/i,

    /\\barchitect\\b/i,
    /\\bprincipal\\b/i,
    /\\bstaff engineer\\b/i,

    /\\bsenior\\b/i,
    /\\bsr\\.?\\s/i,

    /\\btechnical lead\\b/i,
    /\\btech lead\\b/i,
    /\\blead engineer\\b/i,
    /\\blead developer\\b/i,

    /\\bqa\\b/i,
    /\\bqe\\b/i,
    /\\bquality assurance\\b/i,
    /\\btester\\b/i,
    /\\btesting engineer\\b/i,

    /\\bsupport engineer\\b/i,
    /\\btechnical support\\b/i,

    /\\bdevops engineer\\b/i,
    /\\bsite reliability\\b/i,
    /\\bsre\\b/i,

    /\\bsecurity engineer\\b/i,

    /\\bmachine learning engineer\\b/i,
    /\\bml engineer\\b/i,
    /\\bai\\/ml engineer\\b/i,

    /\\bdot ?net\\b/i,
    /\\.net\\b/i,

    /\\bsalesforce\\b/i,
    /\\bsap\\b/i,

    /\\bjava developer\\b/i,
    /\\bjava full[- ]?stack\\b/i,

    /\\bios\\b/i,
    /\\bandroid\\b/i,
    /\\bflutter\\b/i
  ];

  const ALLOWED_TITLE_PATTERNS = [
    /\\bsoftware engineer\\b/i,
    /\\bsoftware developer\\b/i,
    /\\bsoftware development engineer\\b/i,
    /\\bsde[- ]?(?:i|1|ii|2)?\\b/i,

    /\\bfrontend engineer\\b/i,
    /\\bfrontend developer\\b/i,
    /\\bfront[- ]end engineer\\b/i,
    /\\bfront[- ]end developer\\b/i,

    /\\breact(?:\\.js| js|js)? developer\\b/i,
    /\\breact(?:\\.js| js|js)? engineer\\b/i,

    /\\bnext(?:\\.js| js|js)? developer\\b/i,
    /\\bnext(?:\\.js| js|js)? engineer\\b/i,

    /\\bfull[- ]?stack engineer\\b/i,
    /\\bfull[- ]?stack developer\\b/i,
    /\\bmern(?: stack)? developer\\b/i,

    /\\bproduct engineer\\b/i,

    /\\breact native developer\\b/i,
    /\\breact native engineer\\b/i,

    /\\bai product engineer\\b/i,
    /\\bai engineer\\b/i,
    /\\bagentic ai engineer\\b/i,
    /\\bgenerative ai engineer\\b/i,
    /\\bgenai engineer\\b/i
  ];

  // ============================================================
  // HELPERS
  // ============================================================

  const normalize = (value = "") =>
    String(value)
      .toLowerCase()
      .replace(/\\s+/g, " ")
      .trim();

  const escapeRegExpLiteral = value =>
    value.replace(
      /[.*+?^\${}()|[\\]\\\\]/g,
      "\\\\$&"
    );

  function wordBoundaryIncludes(
    haystack,
    needle
  ) {
    const escaped =
      escapeRegExpLiteral(
        normalize(needle)
      );

    if (!escaped) {
      return false;
    }

    return new RegExp(
      \`(?:^|[^a-z0-9])\${escaped}(?:$|[^a-z0-9])\`
    ).test(haystack);
  }

  const sleep = ms =>
    new Promise(resolve =>
      setTimeout(resolve, ms)
    );

  function parseAgeHours(text) {
    const t = normalize(text);

    if (!t) return null;
    if (/just now/.test(t)) return 0;

    let match =
      t.match(/(\\d+)\\s*min(?:ute)?s?\\s*ago/);

    if (match) {
      return Number(match[1]) / 60;
    }

    match =
      t.match(/(\\d+)\\s*hour?s?\\s*ago/);

    if (match) {
      return Number(match[1]);
    }

    if (/yesterday/.test(t)) {
      return 24;
    }

    match =
      t.match(/(\\d+)\\s*day?s?\\s*ago/);

    if (match) {
      return Number(match[1]) * 24;
    }

    match =
      t.match(/(\\d+)\\+?\\s*week?s?\\s*ago/);

    if (match) {
      return Number(match[1]) * 168;
    }

    return null;
  }

  // ============================================================
  // STORAGE
  // ============================================================

  function loadStoredJobs() {
    try {
      const raw =
        localStorage.getItem(
          CONFIG.storageKey
        );

      return raw
        ? JSON.parse(raw)
        : {};
    } catch {
      return {};
    }
  }

  function saveStoredJobs(data) {
    localStorage.setItem(
      CONFIG.storageKey,
      JSON.stringify(data)
    );
  }

  const searchQueue = [];

  for (
    const role
    of CONFIG.roles
  ) {
    for (
      const location
      of CONFIG.locations
    ) {
      searchQueue.push({
        role,
        location
      });
    }
  }

  function getProgress() {
    const value =
      Number(
        localStorage.getItem(
          CONFIG.progressKey
        )
      );

    return (
      Number.isInteger(value) &&
      value >= 0 &&
      value < searchQueue.length
    )
      ? value
      : 0;
  }

  function setProgress(index) {
    localStorage.setItem(
      CONFIG.progressKey,
      String(index)
    );
  }

  function getSessionCount() {
    const value =
      Number(
        sessionStorage.getItem(
          CONFIG.sessionCountKey
        )
      );

    return (
      Number.isInteger(value) &&
      value >= 0
    )
      ? value
      : 0;
  }

  function bumpSessionCount() {
    const next =
      getSessionCount() + 1;

    sessionStorage.setItem(
      CONFIG.sessionCountKey,
      String(next)
    );

    return next;
  }

  // ============================================================
  // JOB ID
  // ============================================================

  function getJobId(card) {
    const direct =
      card.matches?.(
        'a[href*="/jobs/view/"]'
      )
        ? [card]
        : [];

    const links = [
      ...direct,
      ...card.querySelectorAll(
        'a[href*="/jobs/view/"]'
      )
    ];

    for (const link of links) {
      const href =
        link.getAttribute("href") || "";

      const match =
        href.match(
          /\\/jobs\\/view\\/(\\d+)/
        );

      if (match) {
        return match[1];
      }
    }

    const component =
      card.querySelector?.(
        '[componentkey^="job-card-component-ref-"]'
      );

    const componentKey =
      component?.getAttribute(
        "componentkey"
      ) || "";

    return (
      componentKey.match(
        /job-card-component-ref-(\\d+)/
      )?.[1] ||
      null
    );
  }

  // ============================================================
  // ROBUST CARD DETECTION
  // ============================================================

  function climbFromDismiss(button) {
    let node = button;

    for (
      let i = 0;
      i < 12 &&
      node;
      i++
    ) {
      const text =
        (node.innerText || "")
          .trim();

      const dismissCount =
        node.querySelectorAll?.(
          '[aria-label^="Dismiss "][aria-label$=" job"]'
        ).length || 0;

      const jobLinks =
        node.querySelectorAll?.(
          'a[href*="/jobs/view/"]'
        ) || [];

      const idsInside =
        new Set(
          [...jobLinks]
            .map(link =>
              (
                link.getAttribute(
                  "href"
                ) || ""
              )
                .match(
                  /\\/jobs\\/view\\/(\\d+)/
                )?.[1]
            )
            .filter(Boolean)
        );

      if (
        dismissCount === 1 &&
        idsInside.size <= 1 &&
        text.length >= 30 &&
        text.length <= 1400
      ) {
        return node;
      }

      node =
        node.parentElement;
    }

    return null;
  }

  function climbFromJobLink(
    link,
    targetId
  ) {
    let node = link;
    let best = null;

    for (
      let i = 0;
      i < 12 &&
      node;
      i++
    ) {
      const text =
        (node.innerText || "")
          .trim();

      const linksInside =
        node.querySelectorAll?.(
          'a[href*="/jobs/view/"]'
        ) || [];

      const idsInside =
        new Set(
          [...linksInside]
            .map(anchor =>
              (
                anchor.getAttribute(
                  "href"
                ) || ""
              )
                .match(
                  /\\/jobs\\/view\\/(\\d+)/
                )?.[1]
            )
            .filter(Boolean)
        );

      if (
        idsInside.size === 1 &&
        idsInside.has(targetId) &&
        text.length >= 30 &&
        text.length <= 1400
      ) {
        best = node;
      }

      if (
        best &&
        (
          idsInside.size > 1 ||
          text.length > 1400
        )
      ) {
        break;
      }

      node =
        node.parentElement;
    }

    return best;
  }

  function getCardCandidates() {
    const deduped =
      new Map();

    // Strategy 1: dismiss buttons are the strongest per-card anchor —
    // LinkedIn keeps exactly one per card regardless of layout churn.
    const dismissButtons = [
      ...document.querySelectorAll(
        '[aria-label^="Dismiss "][aria-label$=" job"]'
      )
    ];

    for (
      const button
      of dismissButtons
    ) {
      const card =
        climbFromDismiss(
          button
        );

      if (!card) {
        continue;
      }

      let id =
        getJobId(card);

      if (!id) {
        const label =
          button.getAttribute(
            "aria-label"
          ) || "";

        id =
          \`dismiss::\${normalize(
            label
          )}\`;
      }

      if (
        !deduped.has(id)
      ) {
        deduped.set(
          id,
          card
        );
      }
    }

    // Strategy 2: /jobs/view/ links, for cards Strategy 1 missed.
    const jobLinks = [
      ...document.querySelectorAll(
        'a[href*="/jobs/view/"]'
      )
    ];

    for (
      const link
      of jobLinks
    ) {
      const href =
        link.getAttribute(
          "href"
        ) || "";

      const id =
        href.match(
          /\\/jobs\\/view\\/(\\d+)/
        )?.[1];

      if (
        !id ||
        deduped.has(id)
      ) {
        continue;
      }

      const card =
        climbFromJobLink(
          link,
          id
        );

      if (card) {
        deduped.set(
          id,
          card
        );
      }
    }

    // Strategy 3: legacy componentkey attribute, last resort.
    const legacy = [
      ...document.querySelectorAll(
        '[componentkey^="job-card-component-ref-"]'
      )
    ];

    for (
      const element
      of legacy
    ) {
      const id =
        (
          element.getAttribute(
            "componentkey"
          ) || ""
        )
          .match(
            /job-card-component-ref-(\\d+)/
          )?.[1];

      if (
        id &&
        !deduped.has(id)
      ) {
        deduped.set(
          id,
          element
        );
      }
    }

    return [
      ...deduped.values()
    ];
  }

  // ============================================================
  // CARD TEXT
  // ============================================================

  function getLines(card) {
    return (
      card.innerText || ""
    )
      .split("\\n")
      .map(line =>
        line.trim()
      )
      .filter(Boolean)
      .filter(
        (
          line,
          index,
          array
        ) =>
          array.indexOf(line) ===
          index
      );
  }

  // ============================================================
  // TITLE
  // ============================================================

  function getTitle(
    card,
    lines
  ) {
    const dismiss =
      card
        .querySelector(
          '[aria-label^="Dismiss "][aria-label$=" job"]'
        )
        ?.getAttribute(
          "aria-label"
        );

    if (dismiss) {
      return dismiss
        .replace(
          /^Dismiss\\s+/i,
          ""
        )
        .replace(
          /\\s+job$/i,
          ""
        )
        .trim();
    }

    const links = [
      ...card.querySelectorAll(
        'a[href*="/jobs/view/"]'
      )
    ];

    for (
      const link
      of links
    ) {
      const text =
        (
          link.textContent ||
          ""
        )
          .replace(
            /\\s+/g,
            " "
          )
          .trim();

      if (
        text.length >= 3 &&
        text.length <= 180
      ) {
        return text;
      }
    }

    const verified =
      [
        ...card.querySelectorAll(
          "span"
        )
      ]
        .map(element =>
          element
            .textContent
            ?.trim()
        )
        .find(
          text =>
            text &&
            /\\(Verified job\\)$/i
              .test(text)
        );

    if (verified) {
      return verified
        .replace(
          /\\s*\\(Verified job\\)\\s*$/i,
          ""
        )
        .trim();
    }

    return (
      lines[0] ||
      "Unknown title"
    );
  }

  // ============================================================
  // COMPANY + LOCATION
  //
  // Anchoring on the actual company-profile link is more reliable than
  // "the line before the location line" — that positional heuristic
  // breaks whenever LinkedIn inserts a promoted/badge line between the
  // company and location text, which happens often on sponsored cards.
  // ============================================================

  function getCompanyAndLocation(
    card,
    lines,
    title
  ) {
    const junk =
      /^(you[’']?d be a top applicant|be an early applicant|easy apply|promoted|verified job|posted\\b|\\d+\\s+(?:minute|hour|day|week)s?\\s+ago)/i;

    const remaining =
      lines.filter(
        text =>
          text !== title &&
          !junk.test(text) &&
          text.length < 160
      );

    const companyLink =
      card.querySelector(
        'a[href*="/company/"]'
      );

    const companyFromLink =
      (
        companyLink?.textContent ||
        ""
      )
        .replace(/\\s+/g, " ")
        .trim();

    const locationIndex =
      remaining.findIndex(
        text =>
          /\\b(remote|hybrid|on-site|onsite)\\b/i
            .test(text) ||

          CONFIG.locations
            .some(
              loc =>
                normalize(text)
                  .includes(
                    normalize(loc)
                  )
            )
      );

    const location =
      locationIndex >= 0
        ? remaining[
            locationIndex
          ]
        : "";

    const company =
      companyFromLink ||
      (
        locationIndex > 0
          ? remaining[
              locationIndex - 1
            ]
          : remaining.find(
              text =>
                !/applicant|apply|posted|promoted/i
                  .test(text)
            ) ||
            "Unknown company"
      );

    return {
      company,
      location
    };
  }

  // ============================================================
  // POSTED AGE
  // ============================================================

  function getPostedText(
    lines,
    card
  ) {
    const line =
      lines.find(
        text =>
          /(?:Posted\\s+)?(?:\\d+\\s+(?:minute|hour|day|week)s?\\s+ago|yesterday|just now)/i
            .test(text)
      );

    if (line) {
      return line;
    }

    const text =
      card.innerText || "";

    const match =
      text.match(
        /(?:Posted\\s+)?(?:\\d+\\s+(?:minute|hour|day|week)s?\\s+ago|yesterday|just now)/i
      );

    return (
      match?.[0] ||
      ""
    );
  }

  // ============================================================
  // SCORE
  // ============================================================

  function scoreJob(job) {
    const title =
      normalize(
        job.title
      );

    const company =
      normalize(
        job.company
      );

    if (
      REJECT_TITLE_PATTERNS
        .some(regex =>
          regex.test(title)
        )
    ) {
      return {
        reject: true,
        rejection:
          "Rejected title"
      };
    }

    if (
      !ALLOWED_TITLE_PATTERNS
        .some(regex =>
          regex.test(title)
        )
    ) {
      return {
        reject: true,
        rejection:
          "Not target role"
      };
    }

    if (
      CONFIG.excludedCompanies
        .some(name =>
          wordBoundaryIncludes(
            company,
            name
          )
        )
    ) {
      return {
        reject: true,
        rejection:
          "Excluded company"
      };
    }

    if (
      job.ageHours !== null &&
      job.ageHours >
        CONFIG.maxAgeHours
    ) {
      return {
        reject: true,
        rejection:
          "Too old"
      };
    }

    let score = 0;
    const reasons = [];

    // ----------------------------------------------------------
    // ROLE
    // ----------------------------------------------------------

    if (
      /react native/.test(
        title
      )
    ) {
      score += 30;

      reasons.push(
        "+30 React Native"
      );

    } else if (
      /frontend|front-end|front end|react|next/
        .test(title)
    ) {
      score += 30;

      reasons.push(
        "+30 frontend"
      );

    } else if (
      /full[- ]?stack|mern/
        .test(title)
    ) {
      score += 30;

      reasons.push(
        "+30 fullstack"
      );

    } else if (
      /agentic ai|generative ai|genai|ai engineer/
        .test(title)
    ) {
      score += 28;

      reasons.push(
        "+28 AI"
      );

    } else if (
      /product engineer/
        .test(title)
    ) {
      score += 25;

      reasons.push(
        "+25 product"
      );

    } else {
      score += 25;

      reasons.push(
        "+25 software"
      );
    }

    // ----------------------------------------------------------
    // LEVEL
    // ----------------------------------------------------------

    if (
      /sde[- ]?1|sde[- ]?i|associate software engineer|software engineer i\\b/
        .test(title)
    ) {
      score += 12;

      reasons.push(
        "+12 ideal level"
      );
    }

    if (
      /sde[- ]?2|sde[- ]?ii|software engineer ii\\b/
        .test(title)
    ) {
      score -= 6;

      reasons.push(
        "-6 SDE II"
      );
    }

    if (
      /software engineer iii|engineer iii/
        .test(title)
    ) {
      score -= 18;

      reasons.push(
        "-18 level III"
      );
    }

    if (
      /\\bbackend\\b/
        .test(title)
    ) {
      score -= 8;

      reasons.push(
        "-8 backend-only"
      );
    }

    // ----------------------------------------------------------
    // FRESHNESS
    // ----------------------------------------------------------

    if (
      job.ageHours !== null
    ) {
      if (
        job.ageHours <= 6
      ) {
        score += 20;

        reasons.push(
          "+20 very fresh"
        );

      } else if (
        job.ageHours <= 24
      ) {
        score += 16;

        reasons.push(
          "+16 fresh"
        );

      } else if (
        job.ageHours <= 48
      ) {
        score += 10;

        reasons.push(
          "+10 recent"
        );

      } else if (
        job.ageHours <= 72
      ) {
        score += 5;

        reasons.push(
          "+5 recent"
        );
      }
    }

    // ----------------------------------------------------------
    // LINKEDIN SIGNALS
    // ----------------------------------------------------------

    if (
      job.earlyApplicant
    ) {
      score += 8;

      reasons.push(
        "+8 early"
      );
    }

    if (
      job.topApplicant
    ) {
      score += 7;

      reasons.push(
        "+7 top applicant"
      );
    }

    if (
      job.verified
    ) {
      score += 2;

      reasons.push(
        "+2 verified"
      );
    }

    if (
      job.easyApply
    ) {
      score += 1;

      reasons.push(
        "+1 Easy Apply"
      );
    }

    return {
      reject: false,
      score,
      reasons
    };
  }

  // ============================================================
  // ANALYZE CURRENT PAGE
  // ============================================================

  function analyzeCurrentPage() {
    const cards =
      getCardCandidates();

    const goodJobs = [];
    const rejectedStats = {};

    const debugRows = [];

    for (
      const card
      of cards
    ) {
      const lines =
        getLines(card);

      const jobId =
        getJobId(card);

      const title =
        getTitle(
          card,
          lines
        );

      const {
        company,
        location
      } =
        getCompanyAndLocation(
          card,
          lines,
          title
        );

      const postedText =
        getPostedText(
          lines,
          card
        );

      const ageHours =
        parseAgeHours(
          postedText
        );

      const fullText =
        normalize(
          card.innerText || ""
        );

      const job = {
        jobId,
        title,
        company,
        location,
        postedText,
        ageHours,

        easyApply:
          /\\beasy apply\\b/i
            .test(fullText),

        earlyApplicant:
          /\\bbe an early applicant\\b/i
            .test(fullText),

        topApplicant:
          /\\byou[’']?d be a top applicant\\b/i
            .test(fullText),

        verified:
          /\\bverified job\\b/i
            .test(fullText),

        url:
          jobId
            ? \`https://www.linkedin.com/jobs/view/\${jobId}/\`
            : "",

        capturedAt:
          Date.now()
      };

      const result =
        scoreJob(job);

      debugRows.push({
        id: jobId,
        title,
        company,
        location,
        posted:
          postedText,
        accepted:
          !result.reject,
        reason:
          result.rejection || ""
      });

      if (
        result.reject
      ) {
        rejectedStats[
          result.rejection
        ] =
          (
            rejectedStats[
              result.rejection
            ] || 0
          ) + 1;

        continue;
      }

      if (
        result.score <
        CONFIG.minScore
      ) {
        continue;
      }

      goodJobs.push({
        ...job,
        ...result
      });
    }

    console.log(
      "🔍 Parsed current cards:"
    );

    console.table(
      debugRows
    );

    console.log(
      "🗑 Rejections:",
      rejectedStats
    );

    return {
      loaded:
        cards.length,

      goodJobs
    };
  }

  // ============================================================
  // MERGE INTO STORAGE
  // ============================================================

  function analyzeAndSave() {
    const result =
      analyzeCurrentPage();

    const stored =
      loadStoredJobs();

    let added = 0;
    let updated = 0;

    for (
      const job
      of result.goodJobs
    ) {
      const key =
        job.jobId ||
        \`\${normalize(
          job.title
        )}::\${normalize(
          job.company
        )}\`;

      const existing =
        stored[key];

      if (!existing) {
        stored[key] =
          job;

        added++;

      } else {
        stored[key] = {
          ...existing,
          ...job,

          score:
            Math.max(
              existing.score || 0,
              job.score || 0
            )
        };

        updated++;
      }
    }

    saveStoredJobs(
      stored
    );

    return {
      ...result,
      added,
      updated,
      total:
        Object.keys(
          stored
        ).length
    };
  }

  // ============================================================
  // SEARCH URL
  // ============================================================

  function buildSearchURL(
    role,
    location
  ) {
    const url =
      new URL(
        "https://www.linkedin.com/jobs/search/"
      );

    const params = {
      keywords: role,
      location,
      sortBy: "DD"
    };

    if (CONFIG.timeFilter) {
      params.f_TPR =
        CONFIG.timeFilter;
    }

    if (
      CONFIG.experienceLevels
        .length
    ) {
      params.f_E =
        CONFIG.experienceLevels
          .join(",");
    }

    url.search =
      new URLSearchParams(
        params
      );

    return url.toString();
  }

  // ============================================================
  // WAIT FOR CARDS
  // ============================================================

  async function waitForCards(
    timeoutMs = 12000
  ) {
    const start =
      Date.now();

    while (
      Date.now() - start <
      timeoutMs
    ) {
      const count =
        getCardCandidates()
          .length;

      if (
        count > 0
      ) {
        await sleep(600);

        return count;
      }

      await sleep(400);
    }

    return 0;
  }

  if (
    getCardCandidates()
      .length === 0
  ) {
    console.log(
      "⏳ Waiting for LinkedIn job cards..."
    );

    await waitForCards();
  }

  // ============================================================
  // AUTO ANALYZE ON EVERY RUN
  // ============================================================

  const startupResult =
    analyzeAndSave();

  // ============================================================
  // REMOVE OLD UI
  // ============================================================

  [
    "linkedin-power-v21",
    "linkedin-power-v22",
    "linkedin-power-v23",
    "linkedin-power-v23-style",
    "linkedin-power-v24",
    "linkedin-power-v24-style"
  ].forEach(
    id =>
      document
        .getElementById(id)
        ?.remove()
  );

  // ============================================================
  // UI
  // ============================================================

  const overlay =
    document.createElement(
      "div"
    );

  overlay.id =
    "linkedin-power-v24";

  const header =
    document.createElement(
      "div"
    );

  header.className =
    "lp-header";

  const headerLeft =
    document.createElement(
      "div"
    );

  const heading =
    document.createElement(
      "div"
    );

  heading.className =
    "lp-title";

  heading.textContent =
    "⚡ LinkedIn Power Search V2.4";

  const subtitle =
    document.createElement(
      "div"
    );

  subtitle.className =
    "lp-subtitle";

  headerLeft.append(
    heading,
    subtitle
  );

  const closeBtn =
    document.createElement(
      "button"
    );

  closeBtn.textContent =
    "✕";

  header.append(
    headerLeft,
    closeBtn
  );

  const actions =
    document.createElement(
      "div"
    );

  actions.className =
    "lp-actions";

  const nextBtn =
    document.createElement(
      "button"
    );

  nextBtn.className =
    "lp-primary";

  nextBtn.textContent =
    "Next Search →";

  const refreshBtn =
    document.createElement(
      "button"
    );

  refreshBtn.textContent =
    "Re-analyze Current";

  const resetBtn =
    document.createElement(
      "button"
    );

  resetBtn.textContent =
    "Reset";

  actions.append(
    nextBtn,
    refreshBtn,
    resetBtn
  );

  const status =
    document.createElement(
      "div"
    );

  status.className =
    "lp-status";

  const sessionNotice =
    document.createElement(
      "div"
    );

  sessionNotice.className =
    "lp-session-notice";

  sessionNotice.hidden = true;

  const filters =
    document.createElement(
      "div"
    );

  filters.className =
    "lp-filters";

  const textFilter =
    document.createElement(
      "input"
    );

  textFilter.placeholder =
    "Filter title, company or location...";

  const ageFilter =
    document.createElement(
      "select"
    );

  [
    ["72", "Last 72h"],
    ["48", "Last 48h"],
    ["24", "Last 24h"],
    ["6", "Last 6h"],
    ["99999", "All captured"]
  ].forEach(
    ([value, label]) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        value;

      option.textContent =
        label;

      ageFilter.appendChild(
        option
      );
    }
  );

  filters.append(
    textFilter,
    ageFilter
  );

  const results =
    document.createElement(
      "div"
    );

  results.className =
    "lp-results";

  overlay.append(
    header,
    actions,
    status,
    sessionNotice,
    filters,
    results
  );

  // ============================================================
  // CSS
  // ============================================================

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "linkedin-power-v24-style";

  style.textContent = \`
    #linkedin-power-v24 {
      position: fixed;
      inset: 18px;
      z-index: 2147483647;
      background: #09090b;
      color: #fafafa;
      border: 1px solid #27272a;
      border-radius: 18px;
      box-shadow: 0 30px 100px rgba(0,0,0,.65);
      font-family: Inter, system-ui, sans-serif;
      overflow: hidden;
    }

    .lp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid #27272a;
    }

    .lp-title {
      font-size: 20px;
      font-weight: 800;
    }

    .lp-subtitle {
      margin-top: 4px;
      color: #a1a1aa;
      font-size: 12px;
    }

    .lp-header button,
    .lp-actions button {
      background: #18181b;
      color: white;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 9px 13px;
      cursor: pointer;
    }

    .lp-actions {
      display: flex;
      gap: 10px;
      padding: 13px 22px;
      border-bottom: 1px solid #27272a;
    }

    .lp-actions .lp-primary {
      background: white;
      color: black;
    }

    .lp-status {
      padding: 10px 22px;
      color: #a1a1aa;
      font-size: 12px;
      border-bottom: 1px solid #27272a;
    }

    .lp-session-notice {
      padding: 10px 22px;
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
      font-size: 12px;
      font-weight: 600;
      border-bottom: 1px solid #27272a;
    }

    .lp-filters {
      display: flex;
      gap: 10px;
      padding: 12px 22px;
      border-bottom: 1px solid #27272a;
    }

    .lp-filters input {
      flex: 1;
    }

    .lp-filters input,
    .lp-filters select {
      background: #18181b;
      color: white;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 9px 12px;
      outline: none;
    }

    .lp-results {
      height: calc(100% - 190px);
      overflow-y: auto;
      padding: 10px 22px 50px;
    }

    .lp-job {
      display: grid;
      grid-template-columns: 65px 1fr auto;
      gap: 14px;
      padding: 15px 3px;
      border-bottom: 1px solid #27272a;
    }

    .lp-score {
      width: 50px;
      background: #18181b;
      border: 1px solid #3f3f46;
      border-radius: 9px;
      padding: 8px 3px;
      text-align: center;
      font-weight: 800;
      height: max-content;
      cursor: help;
    }

    .lp-high {
      border-color: #22c55e;
    }

    .lp-medium {
      border-color: #3b82f6;
    }

    .lp-job-title {
      font-size: 15px;
      font-weight: 750;
    }

    .lp-company {
      margin-top: 3px;
      color: #d4d4d8;
      font-size: 13px;
    }

    .lp-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 7px;
      color: #a1a1aa;
      font-size: 12px;
    }

    .lp-chip {
      border: 1px solid #3f3f46;
      border-radius: 999px;
      padding: 2px 6px;
    }

    .lp-fresh {
      color: #22c55e;
      font-weight: 700;
    }

    .lp-open {
      background: white;
      color: black;
      text-decoration: none;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 700;
      height: max-content;
    }

    .lp-empty {
      text-align: center;
      color: #a1a1aa;
      padding: 50px;
    }
  \`;

  document.head.appendChild(
    style
  );

  document.body.appendChild(
    overlay
  );

  // ============================================================
  // STATUS
  // ============================================================

  function updateStatus(
    message = ""
  ) {
    const index =
      getProgress();

    const stored =
      loadStoredJobs();

    const current =
      searchQueue[index];

    status.textContent =
      message ||
      \`Search \${
        index + 1
      }/\${searchQueue.length}: \` +
      \`"\${current?.role || ""}" · \${current?.location || ""} · \` +
      \`\${Object.keys(stored).length} aggregated\`;

    const sessionCount =
      getSessionCount();

    if (
      sessionCount >=
      CONFIG.sessionSoftCap
    ) {
      sessionNotice.hidden = false;

      sessionNotice.textContent =
        \`You've run \${sessionCount} searches this session — consider taking a break before continuing, to keep this looking like normal browsing rather than a bulk crawl.\`;
    } else {
      sessionNotice.hidden = true;
    }
  }

  // ============================================================
  // RENDER AGGREGATE
  // ============================================================

  function renderAggregate() {
    const stored =
      Object.values(
        loadStoredJobs()
      );

    const query =
      normalize(
        textFilter.value
      );

    const maxAge =
      Number(
        ageFilter.value
      );

    const filtered =
      stored
        .filter(job => {
          if (
            job.ageHours !== null &&
            job.ageHours >
              maxAge
          ) {
            return false;
          }

          if (
            query &&
            !normalize(
              \`\${job.title} \${job.company} \${job.location}\`
            ).includes(query)
          ) {
            return false;
          }

          return true;
        })
        .sort(
          (a, b) =>
            b.score -
              a.score ||
            (
              a.ageHours ??
              99999
            ) -
            (
              b.ageHours ??
              99999
            )
        );

    results.replaceChildren();

    if (!filtered.length) {
      const empty =
        document.createElement(
          "div"
        );

      empty.className =
        "lp-empty";

      empty.textContent =
        "No aggregated jobs yet.";

      results.appendChild(
        empty
      );

      return;
    }

    for (
      const job
      of filtered
    ) {
      const row =
        document.createElement(
          "div"
        );

      row.className =
        "lp-job";

      const score =
        document.createElement(
          "div"
        );

      score.className =
        "lp-score " +
        (
          job.score >= 65
            ? "lp-high"
            : job.score >= 45
              ? "lp-medium"
              : ""
        );

      score.textContent =
        String(
          job.score
        );

      score.title =
        job.reasons?.join(
          "\\n"
        ) || "";

      const main =
        document.createElement(
          "div"
        );

      const title =
        document.createElement(
          "div"
        );

      title.className =
        "lp-job-title";

      title.textContent =
        job.title;

      const company =
        document.createElement(
          "div"
        );

      company.className =
        "lp-company";

      company.textContent =
        job.company;

      const meta =
        document.createElement(
          "div"
        );

      meta.className =
        "lp-meta";

      const addMeta =
        (
          text,
          className = ""
        ) => {
          const element =
            document.createElement(
              "span"
            );

          element.textContent =
            text;

          element.className =
            className;

          meta.appendChild(
            element
          );
        };

      if (
        job.location
      ) {
        addMeta(
          \`📍 \${job.location}\`
        );
      }

      addMeta(
        \`🕐 \${
          job.postedText ||
          "Age unknown"
        }\`,
        job.ageHours !== null &&
        job.ageHours <= 24
          ? "lp-fresh"
          : ""
      );

      if (
        job.easyApply
      ) {
        addMeta(
          "Easy Apply",
          "lp-chip"
        );
      }

      if (
        job.earlyApplicant
      ) {
        addMeta(
          "Early",
          "lp-chip"
        );
      }

      if (
        job.topApplicant
      ) {
        addMeta(
          "Top applicant",
          "lp-chip"
        );
      }

      if (
        job.verified
      ) {
        addMeta(
          "Verified",
          "lp-chip"
        );
      }

      main.append(
        title,
        company,
        meta
      );

      row.append(
        score,
        main
      );

      if (
        job.url
      ) {
        const open =
          document.createElement(
            "a"
          );

        open.className =
          "lp-open";

        open.href =
          job.url;

        open.target =
          "_blank";

        open.rel =
          "noopener noreferrer";

        open.textContent =
          "Open ↗";

        row.appendChild(
          open
        );
      }

      results.appendChild(
        row
      );
    }

    subtitle.textContent =
      \`\${stored.length} aggregated · \${filtered.length} visible\`;
  }

  // ============================================================
  // NEXT SEARCH
  // ============================================================

  nextBtn.addEventListener(
    "click",
    () => {
      const latest =
        analyzeAndSave();

      let index =
        getProgress();

      index =
        (
          index + 1
        ) %
        searchQueue.length;

      setProgress(
        index
      );

      const sessionCount =
        bumpSessionCount();

      const next =
        searchQueue[index];

      console.log(
        \`➡ Next LinkedIn search: "\${next.role}" · \${next.location}\`
      );

      console.log(
        \`\${latest.loaded} cards parsed · \` +
        \`\${latest.goodJobs.length} relevant · \` +
        \`\${latest.added} new saved · \` +
        \`session search #\${sessionCount}\`
      );

      window.location.href =
        buildSearchURL(
          next.role,
          next.location
        );
    }
  );

  // ============================================================
  // RE-ANALYZE
  // ============================================================

  refreshBtn.addEventListener(
    "click",
    async () => {
      if (
        getCardCandidates()
          .length === 0
      ) {
        updateStatus(
          "Waiting for cards..."
        );

        await waitForCards();
      }

      const result =
        analyzeAndSave();

      updateStatus(
        \`\${result.loaded} parsed · \` +
        \`\${result.goodJobs.length} relevant · \` +
        \`\${result.added} new · \` +
        \`\${result.updated} known · \` +
        \`\${result.total} aggregated\`
      );

      renderAggregate();
    }
  );

  // ============================================================
  // RESET
  // ============================================================

  resetBtn.addEventListener(
    "click",
    () => {
      const okay =
        confirm(
          "Reset LinkedIn Power Search V2.4 data? (This also resets the search queue position, but not the session search counter.)"
        );

      if (!okay) {
        return;
      }

      localStorage.removeItem(
        CONFIG.storageKey
      );

      localStorage.removeItem(
        CONFIG.progressKey
      );

      setProgress(0);

      updateStatus(
        "Aggregation reset."
      );

      renderAggregate();
    }
  );

  textFilter.addEventListener(
    "input",
    renderAggregate
  );

  ageFilter.addEventListener(
    "change",
    renderAggregate
  );

  closeBtn.addEventListener(
    "click",
    () =>
      overlay.remove()
  );

  // ============================================================
  // INITIAL RENDER
  // ============================================================

  updateStatus(
    \`\${startupResult.loaded} cards parsed · \` +
    \`\${startupResult.goodJobs.length} relevant · \` +
    \`\${startupResult.added} NEW · \` +
    \`\${startupResult.updated} known · \` +
    \`\${startupResult.total} total aggregated\`
  );

  renderAggregate();

  console.log(
    "🔥 LinkedIn Power Search V2.4"
  );

  console.log(
    \`\${startupResult.loaded} current cards parsed\`
  );

  console.log(
    \`\${startupResult.goodJobs.length} relevant\`
  );

  console.log(
    \`\${startupResult.added} NEW\`
  );

  console.log(
    \`\${startupResult.updated} known\`
  );

  console.log(
    \`\${startupResult.total} TOTAL aggregated\`
  );

  console.log(
    \`Session searches so far: \${getSessionCount()}\`
  );
})();
`;

export const DEFAULT_LINKEDIN_CONFIG = {
  maxAgeHours: 48,
  minScore: 20,
  sessionSoftCap: 8,
  timeFilter: "r172800",
  experienceLevels: ["2", "3"],
  roles: [
    "software engineer",
    "software development engineer",
    "frontend engineer",
    "react developer",
    "full stack engineer",
    "react native developer",
    "product engineer",
    "ai engineer",
    "agentic ai engineer",
    "generative ai engineer"
  ],
  locations: [
    "Bengaluru",
    "Gurugram",
    "Hyderabad",
    "Noida",
    "Pune"
  ],
  excludedCompanies: [
    "infosys",
    "accenture",
    "tcs",
    "tata consultancy services",
    "wipro",
    "capgemini",
    "cognizant"
  ]
};
