// Bookmarklet template for the Naukri Power Search tool (NaukriScriptPage.jsx).
// Ported verbatim from the standalone ScriptsSaver project's naukri-template.js —
// scoring/filtering/dashboard logic here must stay byte-identical to that source.
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
      /\\bnext(?:\\.js| js|js)? engineer\\b/i
    ],

    fullstack: [
      /\\bfull[- ]?stack engineer\\b/i,
      /\\bfull[- ]?stack developer\\b/i,
      /\\bmern stack developer\\b/i,
      /\\bmern developer\\b/i
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
    ],

    ai: [
      /\\bai product engineer\\b/i,
      /\\bai engineer\\b/i,
      /\\bagentic ai engineer\\b/i,
      /\\bgenerative ai engineer\\b/i,
      /\\bgenai engineer\\b/i,
      /\\bartificial intelligence engineer\\b/i
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

    ["FastAPI", 3, [/\\bfastapi\\b/i]]
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
  // JOB-ID DATE HEURISTIC
  // Assumes first 6 digits = DDMMYY
  // ============================================================

  function parseJobIdDate(jobId) {
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

    const currentYear =
      new Date().getFullYear();

    // Naukri job-ID dates are always near "today" — a wide static
    // range (e.g. 2020-2035) lets a garbage parse land on a real
    // calendar date years off and get trusted as if it were fresh.
    if (
      year < currentYear - 1 ||
      year > currentYear + 1
    ) {
      return null;
    }

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

    // A job can't be posted more than a day or two in the future;
    // anything further out is a bad parse, not a real posting date.
    const twoDaysFromNow =
      new Date();

    twoDaysFromNow.setDate(
      twoDaysFromNow.getDate() + 2
    );

    if (date > twoDaysFromNow) {
      return null;
    }

    return date;
  }

  function getJobIdAge(jobId) {
    const date =
      parseJobIdDate(jobId);

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

    if (diff < 0) {
      return null;
    }

    return Math.floor(
      diff / 86400000
    );
  }

  function formatJobIdDate(
    jobId
  ) {
    const date =
      parseJobIdDate(jobId);

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

    await sleep(180);
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

    const match =
      label.match(
        /(\\d+)\\s*day/
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
    // ORIGINAL-DATE HEURISTIC
    // ========================================================

    const jobIdAge =
      getJobIdAge(
        job.jobId
      );

    // This is now the primary freshness gate.
    if (
      jobIdAge !== null &&
      jobIdAge >
        CONFIG.maxActualAgeDays
    ) {
      return {
        rejected: true,
        rejection:
          "Old by jobId date"
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
        "+20 jobId date today"
      );

    } else if (
      jobIdAge === 1
    ) {
      score += 15;

      reasons.push(
        "+15 jobId date yesterday"
      );

    } else if (
      jobIdAge === 2
    ) {
      score += 10;

      reasons.push(
        "+10 jobId date 2d"
      );

    } else if (
      jobIdAge === null
    ) {
      // Safe fallback only when ID can't be parsed.
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
        "jobId date unavailable; used search freshness fallback"
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
        formatJobIdDate(
          job.jobId
        ),

      freshnessSource:
        jobIdAge !== null
          ? "jobId"
          : "search-api",

      ...stackData
    };
  }

  // ============================================================
  // FILTER / SCORE
  // ============================================================

  const scored = [];

  const rejectionStats =
    {};

  for (
    const job
    of jobs
  ) {
    const result =
      scoreJob(job);

    if (
      result.rejected
    ) {
      rejectionStats[
        result.rejection
      ] =
        (
          rejectionStats[
            result.rejection
          ] || 0
        ) + 1;

      continue;
    }

    const merged = {
      ...job,
      ...result
    };

    if (
      merged.score <
      CONFIG.minScore
    ) {
      rejectionStats[
        "Low score"
      ] =
        (
          rejectionStats[
            "Low score"
          ] || 0
        ) + 1;

      continue;
    }

    scored.push(
      merged
    );
  }

  console.log(
    "🗑 Rejections:",
    rejectionStats
  );

  // ============================================================
  // SECOND DEDUPE — COMPANY + TITLE
  // ============================================================

  const companyTitleMap =
    new Map();

  function normalizedTitleKey(
    title
  ) {
    return normalize(title)
      .replace(
        /\\bsenior\\b/g,
        ""
      )
      .replace(
        /\\bsr\\.?\\b/g,
        ""
      )
      .replace(
        /\\bjunior\\b/g,
        ""
      )
      .replace(
        /\\bjr\\.?\\b/g,
        ""
      )
      .replace(
        /\\s+/g,
        " "
      )
      .trim();
  }

  for (
    const job
    of scored
  ) {
    const key =
      \`\${normalize(
        job.companyName
      )}::\${normalizedTitleKey(
        job.title
      )}\`;

    const existing =
      companyTitleMap.get(
        key
      );

    if (
      !existing ||
      job.score >
        existing.score
    ) {
      companyTitleMap.set(
        key,
        job
      );
    }
  }

  // ============================================================
  // FINAL SORT
  // ============================================================

  const finalJobs =
    [
      ...companyTitleMap.values()
    ]
      .sort(
        (a, b) => {
          if (
            b.score !==
            a.score
          ) {
            return (
              b.score -
              a.score
            );
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

export const DEFAULT_NAUKRI_CONFIG = {
  myExperience: 2.5,
  maxMinimumExperience: 3,
  searchExperience: 3,
  maxActualAgeDays: 2,
  pagesPerSearch: 5,
  resultsPerPage: 20,
  concurrency: 4,
  minScore: 35,
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
