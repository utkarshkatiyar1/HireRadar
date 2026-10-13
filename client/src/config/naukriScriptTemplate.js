// Bookmarklet template for the Naukri Power Search tool (NaukriScriptPage.jsx).
// Originally ported from the standalone ScriptsSaver project's naukri-template.js;
// has since diverged with bug fixes (word-boundary company/stack matching, stricter
// job-ID date validation) and UX additions (loading overlay, hide/seen tracking,
// sort, custom tooltip) — no longer byte-identical to that source, kept in sync
// only where it still makes sense to.
// Placeholders (__XXX__) are substituted with JSON-encoded config values before
// the script is copied/downloaded; it is pasted into the Naukri console by hand
// because the site requires session headers captured via "Copy as fetch".
export const NAUKRI_TEMPLATE = `(async () => {
  const CONFIG = {
    myExperience: __MY_EXPERIENCE__,
    maxMinimumExperience: __MAX_MIN_EXPERIENCE__,
    searchExperience: __SEARCH_EXPERIENCE__,

    // Actual/original-date heuristic cutoff
    maxActualAgeDays: __MAX_ACTUAL_AGE_DAYS__,

    pagesPerSearch: __PAGES_PER_SEARCH__,
    resultsPerPage: __RESULTS_PER_PAGE__,
    concurrency: __CONCURRENCY__,
    minScore: __MIN_SCORE__,

    // Delay between concurrency batches. Naukri starts returning 406s near
    // the tail of large runs (200+ requests) when this is too low — raise it
    // if you see 406s in the console.
    batchDelayMs: __BATCH_DELAY_MS__,

    locations: __LOCATIONS__,

    searches: __SEARCHES__,

    excludedCompanies: __EXCLUDED_COMPANIES__
  };

  // ============================================================
  // HELPERS
  // ============================================================

  const normalize = (value = "") =>
    String(value)
      .toLowerCase()
      .replace(/&amp;/g, "&")
      .replace(/<[^>]*>/g, " ")
      .replace(/[^\\w.+#/ -]/g, " ")
      .replace(/\\s+/g, " ")
      .trim();

  const slugify = value =>
    normalize(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const escapeHTML = value =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  // ============================================================
  // ROLE FAMILIES
  // ============================================================

  const ROLE_FAMILIES = {
    frontend: [
      /\\bfrontend engineer\\b/i,
      /\\bfrontend developer\\b/i,
      /\\bfront[- ]end engineer\\b/i,
      /\\bfront[- ]end developer\\b/i,
      /\\breact(?:\\.js| js|js)? developer\\b/i,
      /\\breact(?:\\.js| js|js)? engineer\\b/i,
      /\\bnext(?:\\.js| js|js)? developer\\b/i,
      /\\bnext(?:\\.js| js|js)? engineer\\b/i,
      /\\btypescript developer\\b/i,
      /\\btypescript engineer\\b/i
    ],

    fullstack: [
      /\\bfull[- ]?stack engineer\\b/i,
      /\\bfull[- ]?stack developer\\b/i,
      /\\bmern stack developer\\b/i,
      /\\bmern developer\\b/i
    ],

    // Checked before software/mobile/product: a hybrid title like "AI
    // Software Engineer" or "AI Product Engineer" would otherwise match
    // those broader families first (object key order = match order) and
    // never reach the ai-specific patterns below.
    ai: [
      /\\bai product engineer\\b/i,
      /\\bai software engineer\\b/i,
      /\\bai application engineer\\b/i,
      /\\bai engineer\\b/i,
      /\\bai developer\\b/i,
      /\\bapplied ai engineer\\b/i,
      /\\bagentic ai engineer\\b/i,
      /\\bgenerative ai engineer\\b/i,
      /\\bgenai engineer\\b/i,
      /\\bgenai developer\\b/i,
      /\\bllm engineer\\b/i,
      /\\bllm developer\\b/i,
      /\\bllm application engineer\\b/i,
      /\\bartificial intelligence engineer\\b/i
    ],

    software: [
      /\\bsoftware engineer\\b/i,
      /\\bsoftware developer\\b/i,
      /\\bsoftware development engineer\\b/i,
      /\\bsde[- ]?i\\b/i,
      /\\bsde[- ]?1\\b/i,
      /\\bsde\\b/i
    ],

    mobile: [
      /\\breact native developer\\b/i,
      /\\breact native engineer\\b/i
    ],

    product: [
      /\\bproduct engineer\\b/i
    ]
  };

  // ============================================================
  // HARD TITLE REJECTION
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
    /\\bmanager engineering\\b/i,

    /\\barchitect\\b/i,

    /\\btechnical lead\\b/i,
    /\\btech lead\\b/i,
    /\\blead developer\\b/i,
    /\\blead engineer\\b/i,

    /\\bsenior\\b/i,
    /\\bsr\\.?\\s/i,
    /\\bstaff engineer\\b/i,
    /\\bprincipal engineer\\b/i,

    /\\bqa\\b/i,
    /\\bqe\\b/i,
    /\\bquality assurance\\b/i,
    /\\bquality engineer\\b/i,
    /\\btester\\b/i,
    /\\btesting engineer\\b/i,

    /\\bsupport engineer\\b/i,
    /\\btechnical support\\b/i,
    /\\bit service operations\\b/i,
    /\\boperations engineer\\b/i,

    /\\bimplementation specialist\\b/i,

    /\\bsecurity engineer\\b/i,
    /\\bdevops engineer\\b/i,
    /\\bsite reliability\\b/i,
    /\\bsre\\b/i,

    /\\bmachine learning engineer\\b/i,
    /\\bml engineer\\b/i,
    /\\bai\\/ml engineer\\b/i,

    /\\bdot ?net\\b/i,
    /\\.net\\b/i,

    /\\bsalesforce\\b/i,
    /\\bsap\\b/i,

    /\\bjava developer\\b/i,
    /\\bjava full[- ]?stack\\b/i,
    /\\bpython developer\\b/i,

    /\\bandroid developer\\b/i,
    /\\bios developer\\b/i,
    /\\bflutter developer\\b/i
  ];

  // ============================================================
  // STACK GROUPS
  // ============================================================

  const STACK_GROUPS = [
    ["React", 10, [/\\breact(?:\\.js|js)?\\b/i]],
    ["Next.js", 10, [/\\bnext(?:\\.js|js| js)?\\b/i]],
    ["TypeScript", 9, [/\\btypescript\\b/i]],
    ["JavaScript", 6, [/\\bjavascript\\b/i]],
    ["Node.js", 8, [/\\bnode(?:\\.js|js| js)?\\b/i]],
    ["Express", 4, [/\\bexpress(?:\\.js)?\\b/i]],
    ["React Native", 9, [/\\breact native\\b/i]],
    ["Redux Toolkit", 5, [/\\bredux toolkit\\b/i]],
    ["Redux", 4, [/\\bredux\\b/i]],
    ["MongoDB", 4, [/\\bmongodb\\b/i]],
    ["PostgreSQL", 5, [/\\bpostgres(?:ql)?\\b/i]],
    ["REST APIs", 4, [/\\brest(?:ful)? api/i]],
    ["AWS", 4, [/\\baws\\b/i]],
    ["Docker", 4, [/\\bdocker\\b/i]],
    ["Tailwind", 3, [/\\btailwind(?: css)?\\b/i]],
    ["Redis", 3, [/\\bredis\\b/i]],
    ["WebSockets", 3, [/\\bwebsockets?\\b/i]],

    [
      "LLM",
      6,
      [
        /\\bllms?\\b/i,
        /\\blarge language models?\\b/i
      ]
    ],

    [
      "RAG",
      6,
      [
        /\\brag\\b/i,
        /\\bretrieval augmented generation\\b/i
      ]
    ],

    ["LangChain", 5, [/\\blangchain\\b/i]],
    ["LangGraph", 6, [/\\blanggraph\\b/i]],

    [
      "Agentic AI",
      7,
      [
        /\\bagentic\\b/i,
        /\\bai agents?\\b/i
      ]
    ],

    [
      "Generative AI",
      6,
      [
        /\\bgenerative ai\\b/i,
        /\\bgenai\\b/i
      ]
    ],

    ["OpenAI", 4, [/\\bopenai\\b/i]],

    [
      "Vector DB",
      4,
      [
        /\\bvector databases?\\b/i,
        /\\bvector db\\b/i
      ]
    ],

    ["FastAPI", 3, [/\\bfastapi\\b/i]],

    ["Python", 8, [/\\bpython\\b/i]],

    ["SQL", 3, [/\\bsql\\b/i]],

    ["Embeddings", 4, [/\\bembeddings?\\b/i]],

    [
      "Tool Calling",
      5,
      [
        /\\btool calling\\b/i,
        /\\btool use\\b/i
      ]
    ],

    [
      "Function Calling",
      5,
      [/\\bfunction calling\\b/i]
    ],

    [
      "Structured Outputs",
      4,
      [/\\bstructured outputs?\\b/i]
    ],

    [
      "LLM Evaluation",
      4,
      [
        /\\bllm evaluation\\b/i,
        /\\bevaluation of llms?\\b/i
      ]
    ]
  ];

  const STACK_PENALTIES = {
    ".net": -25,
    dotnet: -25,
    "asp.net": -25,

    php: -15,
    wordpress: -15,

    salesforce: -25,
    sap: -25,

    "manual testing": -20,

    "spring boot": -12,
    "spring framework": -12,

    kotlin: -12,
    flutter: -10,
    swift: -10,

    mainframe: -25
  };

  // ============================================================
  // CORE STACK FIT
  // ============================================================

  function hasCoreStackFit(roleFamily, content) {
    const tests = {
      frontend: [
        /\\breact(?:\\.js|js)?\\b/i,
        /\\bnext(?:\\.js|js| js)?\\b/i,
        /\\btypescript\\b/i
      ],

      fullstack: [
        /\\breact(?:\\.js|js)?\\b/i,
        /\\bnext(?:\\.js|js| js)?\\b/i,
        /\\bnode(?:\\.js|js| js)?\\b/i,
        /\\btypescript\\b/i,
        /\\bmern\\b/i
      ],

      software: [
        /\\breact(?:\\.js|js)?\\b/i,
        /\\bnext(?:\\.js|js| js)?\\b/i,
        /\\bnode(?:\\.js|js| js)?\\b/i,
        /\\btypescript\\b/i,
        /\\bjavascript\\b/i
      ],

      mobile: [
        /\\breact native\\b/i
      ],

      product: [
        /\\breact(?:\\.js|js)?\\b/i,
        /\\bnext(?:\\.js|js| js)?\\b/i,
        /\\bnode(?:\\.js|js| js)?\\b/i,
        /\\btypescript\\b/i
      ],

      ai: [
        /\\bllms?\\b/i,
        /\\blarge language models?\\b/i,
        /\\brag\\b/i,
        /\\bagentic\\b/i,
        /\\blanggraph\\b/i,
        /\\blangchain\\b/i,
        /\\bgenerative ai\\b/i,
        /\\bgenai\\b/i,
        /\\bopenai\\b/i,
        /\\bfastapi\\b/i
      ]
    };

    return (
      tests[roleFamily]
        ?.some(regex =>
          regex.test(content)
        ) ?? false
    );
  }

  // ============================================================
  // POSTING DATE
  //
  // Naukri's API response carries createdDate as a real epoch-ms
  // timestamp — an exact value, not something to guess at. Earlier
  // versions of this script tried to decode a posting date from the
  // first 6 digits of jobId (assuming a DDMMYY encoding) — that only
  // happened to work for a subset of postings and silently produced
  // "Unknown"/no-freshness-signal for the rest, even when the job was
  // definitely old (e.g. footerPlaceholderLabel: "30+ Days Ago").
  // createdDate replaces that guesswork outright; jobId parsing is
  // kept only as a last-resort fallback for the rare case createdDate
  // is missing from the response.
  // ============================================================

  function parseJobIdDateFallback(jobId) {
    const id =
      String(jobId || "");

    if (
      !/^\\d{12}$/.test(id)
    ) {
      return null;
    }

    const day =
      Number(
        id.slice(0, 2)
      );

    const month =
      Number(
        id.slice(2, 4)
      );

    const year =
      2000 +
      Number(
        id.slice(4, 6)
      );

    const date =
      new Date(
        year,
        month - 1,
        day
      );

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function getPostedDate(job) {
    const fromCreatedDate =
      Number(
        job.createdDate
      );

    if (
      Number.isFinite(
        fromCreatedDate
      ) &&
      fromCreatedDate > 0
    ) {
      return new Date(
        fromCreatedDate
      );
    }

    return parseJobIdDateFallback(
      job.jobId
    );
  }

  function getPostedAgeDays(job) {
    const date =
      getPostedDate(job);

    if (!date) {
      return null;
    }

    const now =
      new Date();

    const today =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

    const posted =
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );

    const diff =
      today.getTime() -
      posted.getTime();

    // A future-dated posting is a bad value (clock skew, bad fallback
    // parse) — treat as unknown rather than trusting a negative age.
    if (diff < 0) {
      return null;
    }

    return Math.floor(
      diff / 86400000
    );
  }

  function formatPostedDate(job) {
    const date =
      getPostedDate(job);

    if (!date) {
      return "Unknown";
    }

    return date
      .toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }
      );
  }

  // ============================================================
  // GET CURRENT AUTH REQUEST
  // ============================================================

  let copiedFetch = "";

  try {
    copiedFetch =
      await navigator
        .clipboard
        .readText();
  } catch {}

  if (
    !copiedFetch ||
    !copiedFetch.includes(
      "jobapi/v3/search"
    )
  ) {
    copiedFetch =
      prompt(
        "Paste Network → jobapi/v3/search → Copy as fetch:"
      );
  }

  if (!copiedFetch) {
    console.error(
      "❌ No Naukri request supplied."
    );

    return;
  }

  const headersMatch =
    copiedFetch.match(
      /"headers"\\s*:\\s*(\\{[\\s\\S]*?\\})\\s*,\\s*"referrer"/
    );

  if (!headersMatch) {
    console.error(
      "❌ Couldn't extract request headers."
    );

    return;
  }

  let copiedHeaders;

  try {
    copiedHeaders =
      JSON.parse(
        headersMatch[1]
      );
  } catch (error) {
    console.error(
      "❌ Header parsing failed:",
      error
    );

    return;
  }

  const allowedHeaders = [
    "accept",
    "appid",
    "authorization",
    "clientid",
    "content-type",
    "gid",
    "nkparam",
    "systemid"
  ];

  const headers = {};

  allowedHeaders
    .forEach(name => {
      if (
        copiedHeaders[name]
      ) {
        headers[name] =
          copiedHeaders[name];
      }
    });

  if (
    !headers.authorization ||
    !headers.nkparam
  ) {
    console.error(
      "❌ Missing Naukri session headers."
    );

    return;
  }

  console.log(
    "✅ Naukri session captured locally."
  );

  // ============================================================
  // BUILD SEARCH URL
  // ============================================================

  function buildURL(
    keyword,
    page
  ) {
    const url =
      new URL(
        "https://www.naukri.com/jobapi/v3/search"
      );

    const location =
      CONFIG.locations
        .join(", ");

    url.search =
      new URLSearchParams({
        noOfResults:
          String(
            CONFIG.resultsPerPage
          ),

        urlType:
          "search_by_key_loc",

        searchType:
          "adv",

        location,

        keyword,

        sort:
          "p",

        pageNo:
          String(page),

        experience:
          String(
            CONFIG.searchExperience
          ),

        k:
          keyword,

        l:
          location,

        nignbevent_src:
          "jobsearchDeskGNB",

        seoKey:
          \`\${slugify(
            keyword
          )}-jobs-in-\${slugify(
            CONFIG.locations[0] ||
            "india"
          )}\`,

        src:
          "jobsearchDesk"
      });

    return url;
  }

  // ============================================================
  // FETCH
  // ============================================================

  async function fetchJobs(
    keyword,
    page
  ) {
    try {
      const response =
        await fetch(
          buildURL(
            keyword,
            page
          ),
          {
            headers,

            method:
              "GET",

            mode:
              "cors",

            credentials:
              "include"
          }
        );

      if (
        !response.ok
      ) {
        console.warn(
          \`⚠️ \${response.status}: \${keyword} p\${page}\`
        );

        return [];
      }

      const data =
        await response.json();

      return (
        data.jobDetails || []
      ).map(job => ({
        ...job,

        __searchKeyword:
          keyword
      }));

    } catch (error) {
      console.warn(
        \`⚠️ \${keyword} p\${page}\`,
        error
      );

      return [];
    }
  }

  // ============================================================
  // SEARCH TASKS
  // ============================================================

  const tasks = [];

  for (
    const keyword
    of CONFIG.searches
  ) {
    for (
      let page = 1;
      page <=
        CONFIG.pagesPerSearch;
      page++
    ) {
      tasks.push({
        keyword,
        page
      });
    }
  }

  console.log(
    \`🔎 \${CONFIG.searches.length} searches · \${CONFIG.locations.length} cities · \${tasks.length} API requests\`
  );

  // ============================================================
  // LOADING OVERLAY
  // ============================================================

  [
    "naukri-power-loading"
  ].forEach(
    id =>
      document
        .getElementById(id)
        ?.remove()
  );

  const loadingOverlay =
    document.createElement(
      "div"
    );

  loadingOverlay.id =
    "naukri-power-loading";

  loadingOverlay.innerHTML = \`
    <div class="npl-card">
      <div class="npl-spinner"></div>
      <div class="npl-title">Fetching jobs…</div>
      <div class="npl-bar-track">
        <div class="npl-bar-fill" id="npl-bar-fill"></div>
      </div>
      <div class="npl-status" id="npl-status">0 / \${tasks.length} requests</div>
    </div>
  \`;

  const loadingStyle =
    document.createElement(
      "style"
    );

  loadingStyle.id =
    "naukri-power-loading-style";

  loadingStyle.textContent = \`
    #naukri-power-loading {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(9, 9, 11, 0.72);
      backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Inter, system-ui, sans-serif;
    }
    .npl-card {
      background: #18181b;
      border: 1px solid #3f3f46;
      border-radius: 16px;
      padding: 28px 32px;
      width: 280px;
      text-align: center;
      color: #fafafa;
    }
    .npl-spinner {
      width: 30px;
      height: 30px;
      margin: 0 auto 14px;
      border: 3px solid #3f3f46;
      border-top-color: #fafafa;
      border-radius: 50%;
      animation: npl-spin 0.8s linear infinite;
    }
    @keyframes npl-spin {
      to { transform: rotate(360deg); }
    }
    .npl-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 14px;
    }
    .npl-bar-track {
      height: 6px;
      background: #27272a;
      border-radius: 999px;
      overflow: hidden;
    }
    .npl-bar-fill {
      height: 100%;
      width: 0%;
      background: #22c55e;
      transition: width 0.2s ease;
    }
    .npl-status {
      margin-top: 10px;
      font-size: 11px;
      color: #a1a1aa;
    }
  \`;

  document.head.appendChild(
    loadingStyle
  );

  document.body.appendChild(
    loadingOverlay
  );

  const nplBarFill =
    loadingOverlay.querySelector(
      "#npl-bar-fill"
    );

  const nplStatus =
    loadingOverlay.querySelector(
      "#npl-status"
    );

  const rawJobs = [];

  for (
    let i = 0;
    i < tasks.length;
    i +=
      CONFIG.concurrency
  ) {
    const batch =
      tasks.slice(
        i,
        i +
        CONFIG.concurrency
      );

    const responses =
      await Promise.all(
        batch.map(task =>
          fetchJobs(
            task.keyword,
            task.page
          )
        )
      );

    responses
      .forEach(list =>
        rawJobs.push(
          ...list
        )
      );

    const completed =
      Math.min(
        i +
        CONFIG.concurrency,
        tasks.length
      );

    nplBarFill.style.width =
      \`\${Math.round(
        (completed / tasks.length) * 100
      )}%\`;

    nplStatus.textContent =
      \`\${completed} / \${tasks.length} requests · \${rawJobs.length} jobs found\`;

    console.log(
      \`⏳ \${completed}/\${tasks.length}\`
    );

    await sleep(
      CONFIG.batchDelayMs
    );
  }

  // ============================================================
  // DEDUPE BY JOB ID
  // ============================================================

  const jobIdMap =
    new Map();

  for (
    const job
    of rawJobs
  ) {
    const existing =
      jobIdMap.get(
        job.jobId
      );

    if (!existing) {
      jobIdMap.set(
        job.jobId,
        {
          ...job,

          __foundThrough: [
            job.__searchKeyword
          ]
        }
      );

    } else if (
      !existing
        .__foundThrough
        .includes(
          job.__searchKeyword
        )
    ) {
      existing
        .__foundThrough
        .push(
          job.__searchKeyword
        );
    }
  }

  const jobs =
    [
      ...jobIdMap.values()
    ];

  // ============================================================
  // ROLE HELPERS
  // ============================================================

  function getRoleFamily(
    title
  ) {
    for (
      const [
        family,
        patterns
      ]
      of Object.entries(
        ROLE_FAMILIES
      )
    ) {
      if (
        patterns.some(
          regex =>
            regex.test(title)
        )
      ) {
        return family;
      }
    }

    return null;
  }

  function rejectTitle(
    title
  ) {
    return (
      REJECT_TITLE_PATTERNS
        .some(
          regex =>
            regex.test(title)
        )
    );
  }

  // ============================================================
  // NAUKRI SEARCH AGE
  // ============================================================

  function getSearchAge(
    job
  ) {
    const label =
      normalize(
        job.footerPlaceholderLabel
      );

    if (
      job.todaysJob ||
      label.includes("today") ||
      label.includes("hour") ||
      label.includes("just")
    ) {
      return 0;
    }

    if (
      label.includes(
        "yesterday"
      )
    ) {
      return 1;
    }

    // "30+ Days Ago" has a literal "+" between the number and "day" —
    // without the optional \\+? this silently fails to match and falls
    // through to the 999 sentinel even though the age is known.
    const match =
      label.match(
        /(\\d+)\\+?\\s*day/
      );

    return match
      ? Number(match[1])
      : 999;
  }

  // ============================================================
  // STACK ANALYSIS
  // ============================================================

  function getStackData(
    job
  ) {
    const content =
      \`\${normalize(
        job.title
      )} \${normalize(
        job.tagsAndSkills
      )} \${normalize(
        job.jobDescription
      )}\`;

    let score = 0;

    const matches = [];

    for (
      const [
        label,
        weight,
        patterns
      ]
      of STACK_GROUPS
    ) {
      if (
        patterns.some(
          regex =>
            regex.test(
              content
            )
        )
      ) {
        score +=
          weight;

        matches.push(
          label
        );
      }
    }

    for (
      const [
        keyword,
        penalty
      ]
      of Object.entries(
        STACK_PENALTIES
      )
    ) {
      const escaped =
        keyword.replace(
          /[.*+?^\${}()|[\\]\\\\]/g,
          "\\\\$&"
        );

      const boundaryRegex =
        new RegExp(
          \`(?:^|[^a-z0-9])\${escaped}(?:$|[^a-z0-9])\`
        );

      if (
        boundaryRegex.test(
          content
        )
      ) {
        score +=
          penalty;
      }
    }

    return {
      stackScore:
        score,

      stackMatches:
        matches,

      content
    };
  }

  // ============================================================
  // SCORE JOB
  // ============================================================

  function scoreJob(
    job
  ) {
    const title =
      normalize(
        job.title
      );

    const company =
      normalize(
        job.companyName
      );

    if (
      rejectTitle(title)
    ) {
      return {
        rejected: true,
        rejection:
          "Rejected title"
      };
    }

    const roleFamily =
      getRoleFamily(
        title
      );

    if (!roleFamily) {
      return {
        rejected: true,
        rejection:
          "Not target role"
      };
    }

    if (
      CONFIG
        .excludedCompanies
        .some(name => {
          const escaped =
            normalize(name).replace(
              /[.*+?^\${}()|[\\]\\\\]/g,
              "\\\\$&"
            );

          if (!escaped) {
            return false;
          }

          return new RegExp(
            \`(?:^|[^a-z0-9])\${escaped}(?:$|[^a-z0-9])\`
          ).test(company);
        })
    ) {
      return {
        rejected: true,
        rejection:
          "Excluded company"
      };
    }

    const minExp =
      Number(
        job.minimumExperience ??
        99
      );

    const maxExp =
      Number(
        job.maximumExperience ??
        99
      );

    if (
      minExp >
      CONFIG
        .maxMinimumExperience
    ) {
      return {
        rejected: true,
        rejection:
          "Minimum experience too high"
      };
    }

    // Kill obviously broad/senior bands.
    if (
      maxExp >= 9 &&
      minExp >= 2
    ) {
      return {
        rejected: true,
        rejection:
          "Overly senior experience range"
      };
    }

    // ========================================================
    // POSTING DATE — primary freshness gate
    // ========================================================

    const jobIdAge =
      getPostedAgeDays(
        job
      );

    if (
      jobIdAge !== null &&
      jobIdAge >
        CONFIG.maxActualAgeDays
    ) {
      return {
        rejected: true,
        rejection:
          "Old by posting date"
      };
    }

    const searchAge =
      getSearchAge(job);

    const stackData =
      getStackData(job);

    if (
      !hasCoreStackFit(
        roleFamily,
        stackData.content
      )
    ) {
      return {
        rejected: true,
        rejection:
          "No core stack fit"
      };
    }

    // ========================================================
    // SCORE
    // ========================================================

    const roleScores = {
      frontend: 30,
      fullstack: 30,
      software: 25,
      mobile: 27,
      product: 23,
      ai: 28
    };

    let score =
      roleScores[
        roleFamily
      ];

    const reasons = [
      \`+\${roleScores[
        roleFamily
      ]} \${roleFamily}\`
    ];

    const cappedStack =
      Math.max(
        -20,
        Math.min(
          stackData.stackScore,
          40
        )
      );

    score +=
      cappedStack;

    reasons.push(
      \`\${
        cappedStack >= 0
          ? "+"
          : ""
      }\${cappedStack} stack\`
    );

    // Experience
    if (
      minExp <= 2 &&
      maxExp <= 4
    ) {
      score += 15;

      reasons.push(
        "+15 ideal experience"
      );

    } else if (
      minExp <=
      CONFIG.myExperience
    ) {
      score += 10;

      reasons.push(
        "+10 experience"
      );

    } else {
      score += 2;

      reasons.push(
        "+2 stretch"
      );
    }

    if (
      maxExp >= 7
    ) {
      score -= 8;

      reasons.push(
        "-8 broad senior range"
      );
    }

    // ========================================================
    // FRESHNESS
    // ========================================================

    if (
      jobIdAge === 0
    ) {
      score += 20;

      reasons.push(
        "+20 posted today"
      );

    } else if (
      jobIdAge === 1
    ) {
      score += 15;

      reasons.push(
        "+15 posted yesterday"
      );

    } else if (
      jobIdAge === 2
    ) {
      score += 10;

      reasons.push(
        "+10 posted 2d ago"
      );

    } else if (
      jobIdAge === null
    ) {
      // Safe fallback only when createdDate/jobId both fail to yield
      // a posting date — falls back to the "X days ago" label text.
      if (
        searchAge === 0
      ) {
        score += 6;

      } else if (
        searchAge === 1
      ) {
        score += 4;

      } else if (
        searchAge <= 2
      ) {
        score += 2;
      }

      reasons.push(
        "posting date unavailable; used search freshness fallback"
      );
    }

    if (
      job.__foundThrough
        .length >= 3
    ) {
      score += 4;

      reasons.push(
        "+4 multiple searches"
      );
    }

    return {
      rejected: false,

      score,
      reasons,

      roleFamily,

      minExp,
      maxExp,

      searchAge,

      jobIdAge,

      jobIdDateLabel:
        formatPostedDate(
          job
        ),

      freshnessSource:
        Number.isFinite(
          Number(job.createdDate)
        ) &&
        Number(job.createdDate) > 0
          ? "createdDate"
          : jobIdAge !== null
          ? "jobId-fallback"
          : "search-api",

      ...stackData
    };
  }

  // ============================================================
  // ENRICH (NO FILTERING) + SORT BY RECENCY
  // ============================================================

  function enrichJob(job) {
    const result =
      scoreJob(job);

    if (!result.rejected) {
      return {
        ...job,
        ...result
      };
    }

    // scoreJob rejected it — still keep the job, just fill the
    // fields the UI reads.
    const stackData =
      getStackData(job);

    return {
      ...job,

      score: 0,
      reasons: [
        result.rejection
      ],

      roleFamily:
        getRoleFamily(
          normalize(job.title)
        ) || "software",

      minExp:
        Number(
          job.minimumExperience ??
          99
        ),

      maxExp:
        Number(
          job.maximumExperience ??
          99
        ),

      searchAge:
        getSearchAge(job),

      jobIdAge:
        getPostedAgeDays(job),

      jobIdDateLabel:
        formatPostedDate(job),

      freshnessSource:
        Number(job.createdDate) > 0
          ? "createdDate"
          : "search-api",

      ...stackData
    };
  }

  const finalJobs =
    jobs
      .map(enrichJob)
      .sort(
        (a, b) => {
          const aDate =
            Number(a.createdDate) || 0;

          const bDate =
            Number(b.createdDate) || 0;

          if (aDate !== bDate) {
            return bDate - aDate;
          }

          return (
            (
              a.jobIdAge ??
              a.searchAge
            ) -
            (
              b.jobIdAge ??
              b.searchAge
            )
          );
        }
      );

  window.__NAUKRI_V24_RESULTS__ =
    finalJobs;

  // ============================================================
  // REMOVE OLD UI
  // ============================================================

  [
    "naukri-power-dashboard",
    "naukri-power-v2",
    "naukri-power-v21",
    "naukri-power-v22",
    "naukri-power-v23",
    "naukri-power-v23-style",
    "naukri-power-v24",
    "naukri-power-v24-style",
    "naukri-power-loading",
    "naukri-power-loading-style"
  ].forEach(
    id =>
      document
        .getElementById(id)
        ?.remove()
  );

  // ============================================================
  // SEEN / HIDDEN JOBS (persisted across runs, per browser)
  // ============================================================

  const HIDDEN_JOBS_KEY =
    "naukriPowerSearch.hiddenJobIds.v1";

  function loadHiddenJobIds() {
    try {
      const raw =
        localStorage.getItem(
          HIDDEN_JOBS_KEY
        );

      return new Set(
        raw
          ? JSON.parse(raw)
          : []
      );
    } catch {
      return new Set();
    }
  }

  function saveHiddenJobIds(
    set
  ) {
    try {
      localStorage.setItem(
        HIDDEN_JOBS_KEY,
        JSON.stringify([
          ...set
        ])
      );
    } catch {}
  }

  const hiddenJobIds =
    loadHiddenJobIds();

  loadingOverlay.remove();

  loadingStyle.remove();

  // ============================================================
  // DASHBOARD
  // ============================================================

  const overlay =
    document.createElement(
      "div"
    );

  overlay.id =
    "naukri-power-v24";

  overlay.innerHTML = \`
    <div class="nv23-header">

      <div>

        <div class="nv23-title">
          ⚡ Naukri Power Search V2.4
        </div>

        <div class="nv23-subtitle">

          \${rawJobs.length} fetched ·
          \${jobs.length} unique ·
          \${finalJobs.length} worth checking

          <br>

          \${escapeHTML(
            CONFIG.locations
              .join(" · ")
          )}

          · min exp ≤
          \${CONFIG.maxMinimumExperience}

          · original-date heuristic ≤
          \${CONFIG.maxActualAgeDays}
          days

        </div>

      </div>

      <button id="nv23-close">
        ✕
      </button>

    </div>

    <div class="nv23-toolbar">

      <input
        id="nv23-search"
        placeholder="Filter company, role or technology..."
      />

      <select id="nv23-family">

        <option value="">
          All target roles
        </option>

        <option value="frontend">
          Frontend
        </option>

        <option value="fullstack">
          Full Stack
        </option>

        <option value="software">
          Software Engineer
        </option>

        <option value="mobile">
          React Native
        </option>

        <option value="product">
          Product Engineer
        </option>

        <option value="ai">
          AI / Agentic
        </option>

      </select>

      <select id="nv23-fresh">

        <option value="2">
          Original ≤ 2 days
        </option>

        <option value="1">
          Original ≤ 1 day
        </option>

        <option value="0">
          Original today
        </option>

        <option value="999">
          All survivors
        </option>

      </select>

      <select id="nv23-sort">

        <option value="score">
          Sort: Score
        </option>

        <option value="fresh">
          Sort: Freshness
        </option>

      </select>

      <label class="nv23-hidden-toggle">
        <input type="checkbox" id="nv23-show-hidden" />
        Show hidden
      </label>

    </div>

    <div class="nv23-applybar">

      <span class="nv23-applybar-label">Auto-apply</span>

      <label>
        Score ≥
        <input
          type="number"
          id="nv23-apply-min"
          value="\${CONFIG.minScore}"
        />
      </label>

      <button id="nv23-select-min">
        Select visible
      </button>

      <button id="nv23-select-clear">
        Clear
      </button>

      <label>
        Max this run
        <input
          type="number"
          id="nv23-apply-max"
          value="50"
        />
      </label>

      <button id="nv23-apply-go" class="nv23-apply-go">
        Apply selected (0)
      </button>

      <button id="nv23-apply-stop" class="nv23-apply-stop" hidden>
        Stop
      </button>

      <button id="nv23-apply-answers">
        Answers
      </button>

      <span id="nv23-apply-status"></span>

    </div>

    <div id="nv23-results"></div>

    <div id="nv23-tooltip" class="nv23-tooltip"></div>
  \`;

  // ============================================================
  // STYLE
  // ============================================================

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "naukri-power-v24-style";

  style.textContent = \`
    #naukri-power-v24 {
      position: fixed;
      inset: 18px;

      z-index: 2147483647;

      background: #09090b;
      color: #fafafa;

      border:
        1px solid #27272a;

      border-radius: 18px;

      box-shadow:
        0 30px 100px
        rgba(0,0,0,.65);

      font-family:
        Inter,
        system-ui,
        sans-serif;

      overflow: hidden;
    }

    .nv23-header {
      display: flex;
      align-items: center;
      justify-content:
        space-between;

      padding:
        18px 22px;

      border-bottom:
        1px solid #27272a;
    }

    .nv23-title {
      font-size: 20px;
      font-weight: 800;
    }

    .nv23-subtitle {
      font-size: 12px;
      color: #a1a1aa;

      margin-top: 4px;

      line-height: 1.55;
    }

    #nv23-close {
      background: #18181b;
      color: #fff;

      border:
        1px solid #3f3f46;

      border-radius: 8px;

      padding:
        8px 12px;

      cursor: pointer;
    }

    .nv23-toolbar {
      display: flex;
      gap: 10px;

      padding:
        13px 22px;

      border-bottom:
        1px solid #27272a;
    }

    #nv23-search {
      flex: 1;
    }

    #nv23-search,
    #nv23-family,
    #nv23-fresh,
    #nv23-sort {
      background: #18181b;
      color: #fff;

      border:
        1px solid #3f3f46;

      padding:
        10px 12px;

      border-radius: 9px;

      outline: none;
    }

    .nv23-hidden-toggle {
      display: flex;
      align-items: center;
      gap: 6px;

      font-size: 12px;
      color: #a1a1aa;

      white-space: nowrap;

      cursor: pointer;
    }

    #nv23-results {
      height:
        calc(100% - 154px);

      overflow-y: auto;

      padding:
        10px 22px 50px;
    }

    .nv23-job {
      display: grid;

      grid-template-columns:
        68px 1fr auto;

      gap: 15px;

      padding:
        16px 4px;

      border-bottom:
        1px solid #27272a;
    }

    .nv23-score {
      width: 52px;

      padding:
        9px 4px;

      text-align: center;

      background: #18181b;

      border:
        1px solid #3f3f46;

      border-radius: 10px;

      font-size: 16px;
      font-weight: 800;
    }

    .nv23-score.high {
      border-color:
        #22c55e;
    }

    .nv23-score.medium {
      border-color:
        #3b82f6;
    }

    .nv23-job-title {
      font-size: 15px;
      font-weight: 750;
    }

    .nv23-company {
      margin-top: 3px;

      font-size: 13px;

      color: #d4d4d8;
    }

    .nv23-meta {
      margin-top: 7px;

      display: flex;
      gap: 12px;
      flex-wrap: wrap;

      color: #a1a1aa;

      font-size: 12px;
    }

    .nv23-skills {
      margin-top: 7px;

      font-size: 11px;

      color: #71717a;
    }

    .nv23-date {
      color: #22c55e;
      font-weight: 700;
    }

    .nv23-fallback {
      color: #f59e0b;
      font-weight: 700;
    }

    .nv23-open {
      display: inline-block;

      background: #fff;
      color: #000;

      padding:
        8px 12px;

      border-radius: 8px;

      text-decoration: none;

      font-size: 12px;
      font-weight: 700;
    }

    .nv23-empty {
      padding: 50px;

      text-align: center;

      color: #a1a1aa;
    }

    .nv23-job-actions {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }

    .nv23-hide {
      display: inline-block;

      background: transparent;
      color: #a1a1aa;

      border:
        1px solid #3f3f46;

      padding:
        7px 10px;

      border-radius: 8px;

      font-size: 11px;
      font-weight: 600;

      cursor: pointer;
    }

    .nv23-hide:hover {
      border-color: #71717a;
      color: #fafafa;
    }

    .nv23-job.nv23-job-hidden {
      opacity: 0.45;
    }

    .nv23-score {
      cursor: help;
    }

    .nv23-tooltip {
      position: fixed;

      max-width: 320px;

      background: #000;
      color: #e4e4e7;

      border: 1px solid #3f3f46;
      border-radius: 8px;

      padding: 10px 12px;

      font-size: 11px;
      line-height: 1.6;

      white-space: pre-line;

      pointer-events: none;

      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.12s, transform 0.12s;

      z-index: 2147483647;
    }

    .nv23-tooltip.nv23-tooltip-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .nv23-applybar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;

      padding: 10px 22px;

      border-bottom:
        1px solid #27272a;

      font-size: 12px;
      color: #a1a1aa;
    }

    .nv23-applybar-label {
      font-weight: 800;
      color: #fafafa;
    }

    .nv23-applybar input[type="number"] {
      width: 60px;

      background: #18181b;
      color: #fff;

      border:
        1px solid #3f3f46;

      border-radius: 6px;

      padding: 4px 6px;
    }

    .nv23-applybar button {
      background: #18181b;
      color: #fff;

      border:
        1px solid #3f3f46;

      border-radius: 8px;

      padding: 6px 10px;

      cursor: pointer;
    }

    .nv23-applybar .nv23-apply-go {
      background: #2563eb;
      border-color: #2563eb;
    }

    .nv23-applybar .nv23-apply-stop {
      background: #b91c1c;
      border-color: #b91c1c;
    }

    .nv23-applybar button:disabled {
      opacity: .45;
      cursor: not-allowed;
    }

    .nv23-pick {
      font-size: 12px;
      color: #a1a1aa;
      cursor: pointer;
    }

    .nv23-apply-status {
      font-size: 11px;
      font-weight: 700;
      color: #a1a1aa;
    }

    .nv23-answers-modal {
      position: absolute;
      inset: 0;
      z-index: 5;

      display: flex;
      align-items: center;
      justify-content: center;

      background: rgba(0,0,0,.7);
    }

    .nv23-answers-card {
      width: min(640px, 92%);

      background: #18181b;

      border:
        1px solid #3f3f46;

      border-radius: 14px;

      padding: 18px;

      font-size: 12px;
      color: #a1a1aa;
    }

    .nv23-answers-card textarea {
      width: 100%;
      min-height: 200px;

      margin: 10px 0;

      background: #09090b;
      color: #fafafa;

      border:
        1px solid #3f3f46;

      border-radius: 8px;

      padding: 10px;

      font: 12px/1.5 ui-monospace, monospace;
    }

    .nv23-answers-card button {
      background: #27272a;
      color: #fff;

      border:
        1px solid #3f3f46;

      border-radius: 8px;

      padding: 6px 12px;

      margin-right: 8px;

      cursor: pointer;
    }
  \`;

  document.head
    .appendChild(style);

  document.body
    .appendChild(overlay);

  // ============================================================
  // RENDER
  // ============================================================

  const results =
    overlay.querySelector(
      "#nv23-results"
    );

  let visibleJobs = [];

  function render() {
    const searchText =
      normalize(
        overlay
          .querySelector(
            "#nv23-search"
          )
          .value
      );

    const family =
      overlay
        .querySelector(
          "#nv23-family"
        )
        .value;

    const maxAge =
      Number(
        overlay
          .querySelector(
            "#nv23-fresh"
          )
          .value
      );

    const sortMode =
      overlay
        .querySelector(
          "#nv23-sort"
        )
        .value;

    const showHidden =
      overlay
        .querySelector(
          "#nv23-show-hidden"
        )
        .checked;

    const filtered =
      finalJobs.filter(
        job => {

          if (
            !showHidden &&
            hiddenJobIds.has(
              String(job.jobId)
            )
          ) {
            return false;
          }

          if (
            family &&
            job.roleFamily !== family
          ) {
            return false;
          }

          const effectiveAge =
            job.jobIdAge ??
            job.searchAge;

          if (
            maxAge !== 999 &&
            effectiveAge >
              maxAge
          ) {
            return false;
          }

          if (searchText) {
            const haystack =
              normalize(
                \`\${job.title}
                 \${job.companyName}
                 \${job.tagsAndSkills}
                 \${job.stackMatches.join(
                   " "
                 )}\`
              );

            if (
              !haystack.includes(
                searchText
              )
            ) {
              return false;
            }
          }

          return true;
        }
      );

    if (
      sortMode === "fresh"
    ) {
      filtered.sort(
        (a, b) =>
          (
            a.jobIdAge ??
            a.searchAge
          ) -
          (
            b.jobIdAge ??
            b.searchAge
          )
      );
    }

    visibleJobs = filtered;

    if (
      !filtered.length
    ) {
      results.innerHTML = \`
        <div class="nv23-empty">
          \${
            showHidden
              ? "No jobs survived these filters."
              : "No jobs survived these filters — or they're all hidden. Try \\"Show hidden\\"."
          }
        </div>
      \`;

      return;
    }

    results.innerHTML =
      filtered
        .map(job => {

          const url =
            job.jdURL
              ?.startsWith(
                "http"
              )
              ? job.jdURL
              : \`https://www.naukri.com\${job.jdURL}\`;

          const location =
            job.placeholders
              ?.find(
                p =>
                  p.type ===
                  "location"
              )
              ?.label || "";

          const scoreClass =
            job.score >= 75
              ? "high"
              : job.score >= 55
              ? "medium"
              : "";

          const freshness =
            job.jobIdAge !== null
              ? \`
                <span class="nv23-date">
                  📅
                  \${escapeHTML(
                    job.jobIdDateLabel
                  )}
                  ·
                  \${job.jobIdAge}d
                </span>
              \`
              : \`
                <span class="nv23-fallback">
                  ⚠ Search freshness fallback:
                  \${job.searchAge}d
                </span>
              \`;

          const isHidden =
            hiddenJobIds.has(
              String(job.jobId)
            );

          return \`
            <div class="nv23-job \${isHidden ? "nv23-job-hidden" : ""}" data-job-id="\${escapeHTML(
              String(job.jobId)
            )}">

              <div
                class="nv23-score \${scoreClass}"
                data-reasons="\${escapeHTML(
                  job.reasons.join(
                    "\\n"
                  )
                )}"
              >
                \${job.score}
              </div>

              <div>

                <div class="nv23-job-title">
                  \${escapeHTML(
                    job.title
                  )}
                </div>

                <div class="nv23-company">
                  \${escapeHTML(
                    job.companyName
                  )}
                </div>

                <div class="nv23-meta">

                  <span>
                    👨‍💻
                    \${job.minExp}-\${job.maxExp}
                    yrs
                  </span>

                  \${
                    location
                      ? \`
                        <span>
                          📍
                          \${escapeHTML(
                            location
                          )}
                        </span>
                      \`
                      : ""
                  }

                  <span>
                    🧩
                    \${escapeHTML(
                      job.roleFamily
                    )}
                  </span>

                  <span>
                    🔎
                    \${
                      job.__foundThrough
                        .length
                    }
                    searches
                  </span>

                  \${freshness}

                </div>

                <div class="nv23-skills">
                  Match:
                  \${escapeHTML(
                    job.stackMatches
                      .slice(
                        0,
                        12
                      )
                      .join(", ")
                  )}
                </div>

              </div>

              <div class="nv23-job-actions">

                <a
                  class="nv23-open"
                  href="\${escapeHTML(
                    url
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open ↗
                </a>

                <label class="nv23-pick">
                  <input
                    type="checkbox"
                    data-select-job-id="\${escapeHTML(
                      String(job.jobId)
                    )}"
                    \${
                      selectedIds.has(
                        String(job.jobId)
                      )
                        ? "checked"
                        : ""
                    }
                  />
                  Pick
                </label>

                <span
                  class="nv23-apply-status"
                  data-apply-status="\${escapeHTML(
                    String(job.jobId)
                  )}"
                >
                  \${escapeHTML(
                    applyLedger[
                      String(job.jobId)
                    ]?.status || ""
                  )}
                </span>

                <button
                  class="nv23-hide"
                  data-hide-job-id="\${escapeHTML(
                    String(job.jobId)
                  )}"
                >
                  \${isHidden ? "Unhide" : "Hide"}
                </button>

              </div>

            </div>
          \`;
        })
        .join("");
  }

  // ============================================================
  // AUTO-APPLY
  // ============================================================
  // Sequential, guarded batch apply through Naukri's own apply-workflow
  // endpoint, using the signed-in session (credentials: include).
  // Stops on 401/403/406/429, CAPTCHA/limit messages, daily quota, or
  // repeated failures. Questionnaires are only answered from the
  // user-defined answer map; a mandatory question with no matching rule
  // parks the job as "Needs answers" instead of guessing.

  const APPLY = {
    path:
      "/cloudgateway-workflow/workflow-services/apply-workflow/v1/apply",

    ledgerKey:
      "naukri_apply_ledger_v1",

    answersKey:
      "naukri_apply_answers_v1",

    minDelayMs: 2500,
    jitterMs: 2000,

    maxConsecutiveFailures: 3
  };

  // Captured from the Apply Agent HAR. Not verified for jobs the agent
  // never recommended — check the first few results before a big run.
  const BASE_APPLY_PAYLOAD = {
    applySrc:
      "JobAgent_RecoOld_Listing_CQ-desktop",
    logstr:
      "JobAgent_RecoOld_Listing_CQ-desktop",
    crossdomain: false,
    jquery: 1,
    webApp: 1,
    chatBotSDK: true,
    systemid: "jobseeker",
    src: "NAUKRI_APPLY",
    applyTypeId: "107",
    mod: "login",
    sid: "",
    featuresFlag: {
      jobAgent: true
    }
  };

  function loadJSON(key, fallback) {
    try {
      return (
        JSON.parse(
          localStorage.getItem(key) ||
            "null"
        ) ?? fallback
      );
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(value)
      );
    } catch {}
  }

  const applyLedger =
    loadJSON(APPLY.ledgerKey, {});

  // [{ match: "notice period", answer: "Immediately" }]
  let applyRules =
    loadJSON(APPLY.answersKey, []);

  const selectedIds =
    new Set();

  let applyRun = null;

  const applyStatusEl =
    overlay.querySelector(
      "#nv23-apply-status"
    );

  const applyGoBtn =
    overlay.querySelector(
      "#nv23-apply-go"
    );

  const applyStopBtn =
    overlay.querySelector(
      "#nv23-apply-stop"
    );

  function setApplyStatus(
    id,
    status,
    message = ""
  ) {
    applyLedger[id] = {
      ...(applyLedger[id] || {}),
      status,
      message,
      updatedAt:
        new Date().toISOString()
    };

    saveJSON(
      APPLY.ledgerKey,
      applyLedger
    );

    const el =
      results.querySelector(
        '[data-apply-status="' +
          id +
          '"]'
      );

    if (el) {
      el.textContent = status;
      el.title = message;
    }
  }

  function updateApplyButton() {
    applyGoBtn.textContent =
      "Apply selected (" +
      selectedIds.size +
      ")";
  }

  function pickAnswer(question) {
    const name =
      normalize(
        question.questionName || ""
      );

    const rule =
      applyRules.find(
        r =>
          r.match &&
          name.includes(
            normalize(r.match)
          )
      );

    if (!rule) {
      return null;
    }

    const options =
      question.answerOption &&
      typeof question.answerOption ===
        "object"
        ? Object.values(
            question.answerOption
          ).map(String)
        : [];

    if (!options.length) {
      return rule.answer;
    }

    const want =
      normalize(rule.answer);

    return (
      options.find(
        o => normalize(o) === want
      ) ||
      options.find(o =>
        normalize(o).includes(want)
      ) ||
      null
    );
  }

  async function postApply(
    jobId,
    applyData
  ) {
    const payload = {
      ...BASE_APPLY_PAYLOAD,
      strJobsarr: [String(jobId)]
    };

    if (applyData) {
      payload.applyData = {
        [String(jobId)]: applyData
      };

      payload.qupData = {};
    }

    const response =
      await fetch(APPLY.path, {
        method: "POST",
        credentials: "include",

        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json",
          appid: "121",
          systemid: "jobseeker"
        },

        body:
          JSON.stringify(payload)
      });

    const text =
      await response.text();

    let data = null;

    try {
      data = JSON.parse(text);
    } catch {}

    return {
      httpStatus:
        response.status,
      data
    };
  }

  function pickItem(data, id) {
    const list =
      data?.jobs || [];

    return (
      list.find(
        x =>
          String(x.jobId) === id
      ) ||
      list[0] ||
      null
    );
  }

  const isApplySuccess = item =>
    item?.status === 200 ||
    /successfully applied/i.test(
      item?.message || ""
    );

  // Returns a reason string when the whole run must halt.
  function haltReason(res, item) {
    if (
      [401, 403, 406, 429].includes(
        res.httpStatus
      )
    ) {
      return (
        "HTTP " +
        res.httpStatus +
        " — blocked/throttled/session expired"
      );
    }

    const message =
      item?.message ||
      res.data?.message ||
      "";

    if (
      !isApplySuccess(item) &&
      /captcha|too many|limit (?:reached|exceeded)|quota/i.test(
        message
      )
    ) {
      return message;
    }

    const quota =
      res.data?.quotaDetails;

    if (
      quota &&
      Number(quota.dailyQuota) > 0 &&
      Number(quota.dailyApplied) >=
        Number(quota.dailyQuota) &&
      !isApplySuccess(item)
    ) {
      return "Daily quota reached";
    }

    return null;
  }

  function showQuota(data) {
    const quota =
      data?.quotaDetails;

    if (!quota) {
      return;
    }

    applyStatusEl.textContent =
      "Quota: " +
      (quota.dailyApplied ?? "?") +
      "/" +
      (quota.dailyQuota ?? "?") +
      " today · " +
      (quota.monthlyApplied ?? "?") +
      "/" +
      (quota.monthlyQuota ?? "?") +
      " month";
  }

  // outcome: applied | needs | failed | halt
  async function applyOne(job) {
    const id =
      String(job.jobId);

    const first =
      await postApply(id);

    const firstItem =
      pickItem(first.data, id);

    const firstHalt =
      haltReason(first, firstItem);

    if (firstHalt) {
      return {
        outcome: "halt",
        reason: firstHalt
      };
    }

    if (!first.data) {
      setApplyStatus(
        id,
        "Failed",
        "Non-JSON response (HTTP " +
          first.httpStatus +
          ")"
      );

      return { outcome: "failed" };
    }

    showQuota(first.data);

    if (isApplySuccess(firstItem)) {
      setApplyStatus(
        id,
        "Applied",
        firstItem.message || ""
      );

      return { outcome: "applied" };
    }

    const questions =
      firstItem?.questionnaire;

    if (
      !Array.isArray(questions) ||
      !questions.length
    ) {
      setApplyStatus(
        id,
        "Needs review",
        firstItem?.message ||
          "Unconfirmed result"
      );

      return { outcome: "failed" };
    }

    const answers = {};
    const missing = [];

    for (const q of questions) {
      const answer =
        pickAnswer(q);

      if (answer) {
        answers[q.questionId] = [
          answer
        ];

      } else if (q.isMandatory) {
        missing.push(
          q.questionName ||
            q.questionId
        );

      } else {
        answers[q.questionId] = [];
      }
    }

    if (missing.length) {
      setApplyStatus(
        id,
        "Needs answers",
        missing.join(" | ")
      );

      return { outcome: "needs" };
    }

    const second =
      await postApply(id, {
        answers
      });

    const secondItem =
      pickItem(second.data, id);

    const secondHalt =
      haltReason(
        second,
        secondItem
      );

    if (secondHalt) {
      return {
        outcome: "halt",
        reason: secondHalt
      };
    }

    showQuota(second.data);

    if (isApplySuccess(secondItem)) {
      setApplyStatus(
        id,
        "Applied",
        secondItem.message || ""
      );

      return { outcome: "applied" };
    }

    setApplyStatus(
      id,
      "Needs review",
      secondItem?.message ||
        "Final response did not confirm"
    );

    return { outcome: "failed" };
  }

  async function runApply() {
    if (applyRun) {
      return;
    }

    const max =
      Math.max(
        1,
        Number(
          overlay.querySelector(
            "#nv23-apply-max"
          ).value
        ) || 50
      );

    const queue =
      finalJobs
        .filter(
          job =>
            selectedIds.has(
              String(job.jobId)
            ) &&
            applyLedger[
              String(job.jobId)
            ]?.status !== "Applied"
        )
        .slice(0, max);

    if (!queue.length) {
      alert(
        "Nothing to apply to — select jobs first (already-applied jobs are skipped)."
      );

      return;
    }

    if (
      !confirm(
        "Apply to " +
          queue.length +
          " job(s) on Naukri using your signed-in session?\\n\\n" +
          "This submits real applications. Jobs whose questionnaire has no matching answer rule are skipped. The run stops on blocks, quota or repeated failures."
      )
    ) {
      return;
    }

    applyRun = {
      cancelled: false
    };

    applyGoBtn.disabled = true;
    applyStopBtn.hidden = false;

    const tally = {
      applied: 0,
      needs: 0,
      failed: 0
    };

    let consecutiveFailures = 0;
    let haltedBecause = "";

    for (
      let i = 0;
      i < queue.length;
      i++
    ) {
      if (applyRun.cancelled) {
        haltedBecause =
          "Stopped by you";
        break;
      }

      const job = queue[i];

      applyStatusEl.textContent =
        (i + 1) +
        "/" +
        queue.length +
        " · applied " +
        tally.applied +
        " · needs answers " +
        tally.needs +
        " · failed " +
        tally.failed;

      setApplyStatus(
        String(job.jobId),
        "In progress"
      );

      let result;

      try {
        result =
          await applyOne(job);

      } catch (error) {
        setApplyStatus(
          String(job.jobId),
          "Failed",
          error.message
        );

        result = {
          outcome: "failed"
        };
      }

      if (
        result.outcome === "halt"
      ) {
        setApplyStatus(
          String(job.jobId),
          "Ready",
          "Halted before result"
        );

        haltedBecause =
          result.reason;

        break;
      }

      tally[result.outcome]++;

      consecutiveFailures =
        result.outcome === "failed"
          ? consecutiveFailures + 1
          : 0;

      if (
        consecutiveFailures >=
        APPLY.maxConsecutiveFailures
      ) {
        haltedBecause =
          APPLY.maxConsecutiveFailures +
          " failures in a row";

        break;
      }

      await sleep(
        APPLY.minDelayMs +
          Math.random() *
            APPLY.jitterMs
      );
    }

    const summary =
      "Done — applied " +
      tally.applied +
      ", needs answers " +
      tally.needs +
      ", failed " +
      tally.failed +
      (haltedBecause
        ? " · halted: " +
          haltedBecause
        : "");

    applyStatusEl.textContent =
      summary;

    console.log(
      "🚀 Auto-apply: " + summary
    );

    applyRun = null;
    applyGoBtn.disabled = false;
    applyStopBtn.hidden = true;
  }

  function openAnswersEditor() {
    const modal =
      document.createElement(
        "div"
      );

    modal.className =
      "nv23-answers-modal";

    modal.innerHTML =
      '<div class="nv23-answers-card">' +
      "<b>Questionnaire answers</b><br>" +
      "One rule per line: <code>question keyword => answer</code>. " +
      "A rule matches when the question text contains the keyword. " +
      "For multiple-choice questions the answer must match an option, " +
      "otherwise the job is parked as “Needs answers”." +
      '<textarea id="nv23-answers-text" placeholder="notice period => Immediately&#10;relocate => Yes"></textarea>' +
      '<button id="nv23-answers-save">Save</button>' +
      '<button id="nv23-answers-cancel">Cancel</button>' +
      "</div>";

    overlay.appendChild(modal);

    const text =
      modal.querySelector(
        "#nv23-answers-text"
      );

    text.value =
      applyRules
        .map(
          r =>
            r.match +
            " => " +
            r.answer
        )
        .join("\\n");

    modal.querySelector(
      "#nv23-answers-cancel"
    ).onclick = () =>
      modal.remove();

    modal.querySelector(
      "#nv23-answers-save"
    ).onclick = () => {
      applyRules =
        text.value
          .split(/\\r?\\n/)
          .map(line => {
            const at =
              line.indexOf("=>");

            if (at < 0) {
              return null;
            }

            const match =
              line
                .slice(0, at)
                .trim();

            const answer =
              line
                .slice(at + 2)
                .trim();

            return match && answer
              ? { match, answer }
              : null;
          })
          .filter(Boolean);

      saveJSON(
        APPLY.answersKey,
        applyRules
      );

      modal.remove();
    };
  }

  overlay
    .querySelector(
      "#nv23-select-min"
    )
    .addEventListener(
      "click",
      () => {
        const min =
          Number(
            overlay.querySelector(
              "#nv23-apply-min"
            ).value
          ) || 0;

        for (
          const job
          of visibleJobs
        ) {
          const id =
            String(job.jobId);

          if (
            job.score >= min &&
            !hiddenJobIds.has(id) &&
            applyLedger[id]
              ?.status !== "Applied"
          ) {
            selectedIds.add(id);
          }
        }

        updateApplyButton();
        render();
      }
    );

  overlay
    .querySelector(
      "#nv23-select-clear"
    )
    .addEventListener(
      "click",
      () => {
        selectedIds.clear();
        updateApplyButton();
        render();
      }
    );

  results.addEventListener(
    "change",
    event => {
      const box =
        event.target.closest(
          "[data-select-job-id]"
        );

      if (!box) {
        return;
      }

      const id =
        box.dataset.selectJobId;

      if (box.checked) {
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }

      updateApplyButton();
    }
  );

  applyGoBtn.addEventListener(
    "click",
    runApply
  );

  applyStopBtn.addEventListener(
    "click",
    () => {
      if (applyRun) {
        applyRun.cancelled = true;
      }
    }
  );

  overlay
    .querySelector(
      "#nv23-apply-answers"
    )
    .addEventListener(
      "click",
      openAnswersEditor
    );

  // ============================================================
  // EVENTS
  // ============================================================

  overlay
    .querySelector(
      "#nv23-search"
    )
    .addEventListener(
      "input",
      render
    );

  overlay
    .querySelector(
      "#nv23-family"
    )
    .addEventListener(
      "change",
      render
    );

  overlay
    .querySelector(
      "#nv23-fresh"
    )
    .addEventListener(
      "change",
      render
    );

  overlay
    .querySelector(
      "#nv23-sort"
    )
    .addEventListener(
      "change",
      render
    );

  overlay
    .querySelector(
      "#nv23-show-hidden"
    )
    .addEventListener(
      "change",
      render
    );

  overlay
    .querySelector(
      "#nv23-close"
    )
    .addEventListener(
      "click",
      () =>
        overlay.remove()
    );

  // Delegate hide/unhide clicks — the results list is fully
  // re-rendered on every filter change, so listeners must live on
  // the stable parent rather than on the (disposable) buttons.
  results.addEventListener(
    "click",
    event => {
      const button =
        event.target.closest(
          "[data-hide-job-id]"
        );

      if (!button) {
        return;
      }

      const jobId =
        button.dataset
          .hideJobId;

      if (
        hiddenJobIds.has(
          jobId
        )
      ) {
        hiddenJobIds.delete(
          jobId
        );
      } else {
        hiddenJobIds.add(
          jobId
        );
      }

      saveHiddenJobIds(
        hiddenJobIds
      );

      render();
    }
  );

  // Custom tooltip for the score badge — the score card lives in a
  // fixed-position overlay near the window edge, so a native title
  // attribute is slow to appear and gets clipped; this follows the
  // cursor and is positioned in fixed coordinates instead.
  const tooltip =
    overlay.querySelector(
      "#nv23-tooltip"
    );

  results.addEventListener(
    "mouseover",
    event => {
      const scoreEl =
        event.target.closest(
          ".nv23-score"
        );

      if (!scoreEl) {
        return;
      }

      tooltip.textContent =
        scoreEl.dataset
          .reasons || "";

      tooltip.classList.add(
        "nv23-tooltip-visible"
      );
    }
  );

  results.addEventListener(
    "mousemove",
    event => {
      if (
        !tooltip.classList.contains(
          "nv23-tooltip-visible"
        )
      ) {
        return;
      }

      tooltip.style.left =
        \`\${event.clientX + 14}px\`;

      tooltip.style.top =
        \`\${event.clientY + 14}px\`;
    }
  );

  results.addEventListener(
    "mouseout",
    event => {
      const scoreEl =
        event.target.closest(
          ".nv23-score"
        );

      if (!scoreEl) {
        return;
      }

      tooltip.classList.remove(
        "nv23-tooltip-visible"
      );
    }
  );

  render();

  // ============================================================
  // CONSOLE SUMMARY
  // ============================================================

  console.table(
    finalJobs.map(
      job => ({
        Score:
          job.score,

        Role:
          job.roleFamily,

        Title:
          job.title,

        Company:
          job.companyName,

        Exp:
          \`\${job.minExp}-\${job.maxExp}\`,

        JobIdDate:
          job.jobIdDateLabel,

        JobIdAge:
          job.jobIdAge,

        SearchAge:
          job.searchAge,

        FreshnessSource:
          job.freshnessSource,

        Skills:
          job.stackMatches
            .slice(0, 6)
            .join(", ")
      })
    )
  );

  console.log(
    \`🔥 V2.4 complete — \${finalJobs.length} jobs worth checking.\`
  );

  console.log(
    "Full results: window.__NAUKRI_V24_RESULTS__"
  );
})();
`;

// Two Naukri accounts, each logged in under a different resume/persona —
// the search keywords are the only thing that should differ between them
// (per user: "experience, excluded companies etc should remain same, just
// one should be for Frontend/FullStck specific searches, other for AI
// Ones"). Everything else in DEFAULT_NAUKRI_CONFIG is shared; a profile
// selection in the UI swaps only cfg.searches to the matching preset below.
export const NAUKRI_PROFILES = [
  {
    id: "frontend-fullstack",
    label: "Frontend / Full-Stack",
    description: "React, Next.js, React Native, full-stack roles — matches the Frontend/Full-Stack Engineer resume.",
    searches: [
      "frontend engineer",
      "frontend developer",
      "front end developer",
      "react developer",
      "react js developer",
      "react js engineer",
      "next js developer",
      "next js engineer",
      "typescript developer",
      "full stack engineer",
      "full stack developer",
      "mern stack developer",
      "react native developer",
      "software engineer",
      "software developer",
      "software development engineer",
      "sde 1",
      "sde i"
    ]
  },
  {
    id: "agentic-ai-product",
    label: "Agentic AI / Product",
    // Deliberately excludes "machine learning engineer" / "ml engineer" —
    // REJECT_TITLE_PATTERNS hard-rejects those titles, so searching for them
    // would just burn API requests for zero results.
    description: "AI/agent engineering, LLM & product-engineering roles — matches the Agentic AI & Product Engineering resume.",
    searches: [
      "ai engineer",
      "ai software engineer",
      "ai developer",
      "agentic ai engineer",
      "generative ai engineer",
      "genai engineer",
      "genai developer",
      "ai product engineer",
      "applied ai engineer",
      "ai application engineer",
      "llm engineer",
      "llm developer",
      "product engineer",
      "software development engineer",
      "software engineer",
      "sde 1",
      "sde i"
    ]
  }
];

export const DEFAULT_NAUKRI_PROFILE_ID = NAUKRI_PROFILES[0].id;

export const DEFAULT_NAUKRI_CONFIG = {
  myExperience: 2.5,
  maxMinimumExperience: 3,
  searchExperience: 3,
  maxActualAgeDays: 2,
  pagesPerSearch: 5,
  resultsPerPage: 20,
  concurrency: 4,
  minScore: 35,
  batchDelayMs: 400,
  locations: [
    "bengaluru",
    "gurugram",
    "hyderabad",
    "noida",
    "pune",
    "chennai",
    "mumbai",
    "delhi"
  ],
  searches: [
    "software engineer",
    "software developer",
    "software development engineer",
    "sde 1",
    "sde i",
    "frontend engineer",
    "frontend developer",
    "front end developer",
    "react developer",
    "react js developer",
    "next js developer",
    "typescript developer",
    "full stack engineer",
    "full stack developer",
    "mern stack developer",
    "product engineer",
    "react native developer",
    "ai product engineer",
    "ai engineer",
    "agentic ai engineer",
    "generative ai engineer"
  ],
  excludedCompanies: [
    "infosys",
    "accenture",
    "tcs",
    "wipro",
    "capgemini",
    "cognizant"
  ]
};
