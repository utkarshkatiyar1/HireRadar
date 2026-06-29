// ─────────────────────────────────────────────────────────────────────────────
// HOW TO ONBOARD A NEW COMPANY (60 seconds)
//
// 1. Open their careers page → View Page Source
//    → Jobs in HTML?  YES → SSR (Taleo, custom HTML)
//                     NO  → Open DevTools → Network → trigger search
//
// 2. DevTools: what do you see?
//    → POST/GET returning JSON + "myworkdayjobs.com" → ats: 'workday'
//    → GET "greenhouse.io"                           → ats: 'greenhouse'
//    → GET "lever.co"                                → ats: 'lever'
//    → POST "eightfold.ai"                           → ats: 'eightfold'
//    → HTML pages with ?jobOffset= pagination        → ats: 'taleo-ssr'
//    → Anything else                                 → ats: 'custom-api'
//    → Needs JS to load jobs at all                  → ats: 'playwright'
//
// 3. Paste here: company name + ATS type + token/URL → I add in 30 seconds.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  keywords:  ['react', 'frontend', 'front-end', 'mern', 'next.js', 'nextjs'],
  locations: [
    'india', 'remote', 'bangalore', 'bengaluru', 'mumbai',
    'hyderabad', 'pune', 'chennai', 'delhi', 'noida', 'gurgaon', 'gurugram',
  ],
  maxExp: 2,
};

const sources = [

  // ── Custom API ────────────────────────────────────────────────────────────
  { company: 'Amazon',    ats: 'custom-api', scraperModule: 'amazon'    },
  { company: 'Slice',     ats: 'custom-api', scraperModule: 'slice'     },
  { company: 'Swiggy',    ats: 'custom-api', scraperModule: 'swiggy'    },
  { company: 'Juspay',    ats: 'custom-api', scraperModule: 'juspay'    },

  // ── Playwright (JS-rendered SPA) ──────────────────────────────────────────
  { company: 'Accenture', ats: 'playwright', scraperModule: 'accenture' },

  // ── Workday ───────────────────────────────────────────────────────────────
  {
    company:       'PayPal',
    ats:           'workday',
    workdayBase:   'https://paypal.wd1.myworkdayjobs.com',
    workdayTenant: 'paypal',
    workdaySite:   'jobs',
  },
  {
    company:       'Salesforce',
    ats:           'workday',
    workdayBase:   'https://salesforce.wd12.myworkdayjobs.com',
    workdayTenant: 'salesforce',
    workdaySite:   'External_Career_Site',
  },
  {
    company:       'Workday',
    ats:           'workday',
    workdayBase:   'https://workday.wd5.myworkdayjobs.com',
    workdayTenant: 'workday',
    workdaySite:   'Workday',
  },
  {
    company:       'CrowdStrike',
    ats:           'workday',
    workdayBase:   'https://crowdstrike.wd5.myworkdayjobs.com',
    workdayTenant: 'crowdstrike',
    workdaySite:   'crowdstrikecareers',
  },
  {
    company:       'Adobe',
    ats:           'workday',
    workdayBase:   'https://adobe.wd5.myworkdayjobs.com',
    workdayTenant: 'adobe',
    workdaySite:   'external_experienced',
  },
  {
    company:       'Cisco',
    ats:           'workday',
    workdayBase:   'https://cisco.wd5.myworkdayjobs.com',
    workdayTenant: 'cisco',
    workdaySite:   'Cisco_Careers',
  },
  {
    company:       'Nvidia',
    ats:           'workday',
    workdayBase:   'https://nvidia.wd5.myworkdayjobs.com',
    workdayTenant: 'nvidia',
    workdaySite:   'NVIDIAExternalCareerSite',
  },
  {
    company:       'BrowserStack',
    ats:           'workday',
    workdayBase:   'https://browserstack.wd3.myworkdayjobs.com',
    workdayTenant: 'browserstack',
    workdaySite:   'External',
  },
  {
    company:       'Siemens Healthineers',
    ats:           'workday',
    workdayBase:   'https://onehealthineers.wd3.myworkdayjobs.com',
    workdayTenant: 'onehealthineers',
    workdaySite:   'SHSJB',
  },
  {
    company:       'Micron',
    ats:           'workday',
    workdayBase:   'https://micron.wd1.myworkdayjobs.com',
    workdayTenant: 'micron',
    workdaySite:   'External',
  },
  {
    company:       'Target',
    ats:           'workday',
    workdayBase:   'https://target.wd5.myworkdayjobs.com',
    workdayTenant: 'target',
    workdaySite:   'targetcareers',
  },
  {
    company:       'PwC',
    ats:           'workday',
    workdayBase:   'https://pwc.wd3.myworkdayjobs.com',
    workdayTenant: 'pwc',
    workdaySite:   'Global_Experienced_Careers',
  },

  // ── Greenhouse ────────────────────────────────────────────────────────────
  { company: 'Postman',      ats: 'greenhouse', greenhouseToken: 'postman'                    },
  { company: 'PhonePe',      ats: 'greenhouse', greenhouseToken: 'phonepe'                    },
  { company: 'Stripe',       ats: 'greenhouse', greenhouseToken: 'stripe'                     },
  { company: 'InMobi',       ats: 'greenhouse', greenhouseToken: 'inmobi'                     },
  { company: 'Airbnb',       ats: 'greenhouse', greenhouseToken: 'airbnb'                     },
  { company: 'Discord',      ats: 'greenhouse', greenhouseToken: 'discord'                    },
  { company: 'Twilio',       ats: 'greenhouse', greenhouseToken: 'twilio'                     },
  { company: 'Okta',         ats: 'greenhouse', greenhouseToken: 'okta'                       },
  { company: 'Cloudflare',   ats: 'greenhouse', greenhouseToken: 'cloudflare'                 },
  { company: 'Asana',        ats: 'greenhouse', greenhouseToken: 'asana'                      },
  { company: 'Intercom',     ats: 'greenhouse', greenhouseToken: 'intercom'                   },
  { company: 'PagerDuty',    ats: 'greenhouse', greenhouseToken: 'pagerduty'                  },
  { company: 'MongoDB',      ats: 'greenhouse', greenhouseToken: 'mongodb'                    },
  { company: 'Brex',         ats: 'greenhouse', greenhouseToken: 'brex'                       },
  { company: 'Robinhood',    ats: 'greenhouse', greenhouseToken: 'robinhood'                  },
  { company: 'Duolingo',     ats: 'greenhouse', greenhouseToken: 'duolingo'                   },
  { company: 'Dropbox',      ats: 'greenhouse', greenhouseToken: 'dropbox'                    },
  { company: 'Figma',        ats: 'greenhouse', greenhouseToken: 'figma'                      },
  { company: 'Datadog',      ats: 'greenhouse', greenhouseToken: 'datadog'                    },
  { company: 'Databricks',   ats: 'greenhouse', greenhouseToken: 'databricks'                 },
  { company: 'Razorpay',     ats: 'greenhouse', greenhouseToken: 'razorpaysoftwareprivatelimited' },
  { company: 'Groww',        ats: 'greenhouse', greenhouseToken: 'groww'                      },
  { company: 'GitLab',       ats: 'greenhouse', greenhouseToken: 'gitlab'                     },
  { company: 'Airtable',     ats: 'greenhouse', greenhouseToken: 'airtable'                   },
  { company: 'Amplitude',    ats: 'greenhouse', greenhouseToken: 'amplitude'                  },
  { company: 'Mixpanel',     ats: 'greenhouse', greenhouseToken: 'mixpanel'                   },
  { company: 'LaunchDarkly', ats: 'greenhouse', greenhouseToken: 'launchdarkly'               },
  { company: 'Elastic',      ats: 'greenhouse', greenhouseToken: 'elastic'                    },
  { company: 'PlanetScale',  ats: 'greenhouse', greenhouseToken: 'planetscale'                },
  { company: 'Netlify',      ats: 'greenhouse', greenhouseToken: 'netlify'                    },
  { company: 'Mattermost',   ats: 'greenhouse', greenhouseToken: 'mattermost'                 },
  { company: 'Vercel',       ats: 'greenhouse', greenhouseToken: 'vercel'                     },
  { company: 'Miro',         ats: 'greenhouse', greenhouseToken: 'realtimeboardglobal'        },
  { company: 'Webflow',      ats: 'greenhouse', greenhouseToken: 'webflow'                    },
  { company: 'Scale AI',     ats: 'greenhouse', greenhouseToken: 'scaleai'                    },
  { company: 'Descript',     ats: 'greenhouse', greenhouseToken: 'descript'                   },
  { company: 'Pendo',        ats: 'greenhouse', greenhouseToken: 'pendo'                      },
  { company: 'Lyft',        ats: 'greenhouse', greenhouseToken: 'lyft'                       },
  { company: 'Reddit',      ats: 'greenhouse', greenhouseToken: 'reddit'                     },
  { company: 'Zscaler',     ats: 'greenhouse', greenhouseToken: 'zscaler'                    },
  { company: 'Arcesium',    ats: 'greenhouse', greenhouseToken: 'arcesiumllc'                },
  { company: 'Riot Games',  ats: 'greenhouse', greenhouseToken: 'riotgames'                  },
  { company: 'Optiver',     ats: 'greenhouse', greenhouseToken: 'optiverus'                  },
  { company: 'Skyscanner',  ats: 'greenhouse', greenhouseToken: 'skyscanner'                 },
  { company: 'Rubrik',      ats: 'greenhouse', greenhouseToken: 'rubrik'                     },
  { company: 'Twitch',      ats: 'greenhouse', greenhouseToken: 'twitch'                     },
  { company: 'Typeform',    ats: 'greenhouse', greenhouseToken: 'typeform'                    },
  { company: 'Contentful',  ats: 'greenhouse', greenhouseToken: 'contentful'                  },
  { company: 'Automattic',  ats: 'greenhouse', greenhouseToken: 'automatticcareers'           },
  { company: 'Box',         ats: 'greenhouse', greenhouseToken: 'boxinc'                      },
  { company: 'dbt Labs',    ats: 'greenhouse', greenhouseToken: 'dbtlabsinc'                  },
  { company: 'Fastly',      ats: 'greenhouse', greenhouseToken: 'fastly'                      },
  { company: 'Gusto',       ats: 'greenhouse', greenhouseToken: 'gusto'                       },
  { company: 'Remote',      ats: 'greenhouse', greenhouseToken: 'remotecom'                   },
  { company: 'Calendly',    ats: 'greenhouse', greenhouseToken: 'calendly'                    },
  { company: 'Culture Amp', ats: 'greenhouse', greenhouseToken: 'cultureamp'                  },

  // ── Ashby ─────────────────────────────────────────────────────────────────
  { company: 'Notion',     ats: 'ashby', ashbySlug: 'notion'     },
  { company: 'ClickUp',    ats: 'ashby', ashbySlug: 'clickup'    },
  { company: 'Linear',     ats: 'ashby', ashbySlug: 'linear'     },
  { company: 'Sentry',     ats: 'ashby', ashbySlug: 'sentry'     },
  { company: 'Supabase',   ats: 'ashby', ashbySlug: 'supabase'   },
  { company: 'Ramp',       ats: 'ashby', ashbySlug: 'ramp'       },
  { company: 'Replit',     ats: 'ashby', ashbySlug: 'replit'     },
  { company: 'Snowflake',  ats: 'ashby', ashbySlug: 'snowflake'  },
  { company: 'Confluent',  ats: 'ashby', ashbySlug: 'confluent'  },
  { company: 'Redis',      ats: 'ashby', ashbySlug: 'redis'      },
  { company: 'Plaid',      ats: 'ashby', ashbySlug: 'plaid'      },
  { company: 'PostHog',   ats: 'ashby', ashbySlug: 'posthog'   },
  { company: 'Resend',    ats: 'ashby', ashbySlug: 'resend'     },
  { company: 'Dovetail',  ats: 'ashby', ashbySlug: 'dovetail'   },
  { company: 'Railway',   ats: 'ashby', ashbySlug: 'railway'    },
  { company: 'Render',    ats: 'ashby', ashbySlug: 'render'     },
  { company: 'Jellyfish', ats: 'ashby', ashbySlug: 'jellyfish'  },
  { company: 'Vanta',         ats: 'ashby', ashbySlug: 'vanta'         },
  { company: 'Juniper Square', ats: 'ashby', ashbySlug: 'junipersquare' },
  { company: 'Docker',        ats: 'ashby', ashbySlug: 'docker'         },

  // ── SmartRecruiters ───────────────────────────────────────────────────────
  { company: 'Canva',      ats: 'smartrecruiters', smartrecruitersSlug: 'Canva'      },
  { company: 'Zomato',     ats: 'smartrecruiters', smartrecruitersSlug: 'Zomato1'    },
  { company: 'Grab',       ats: 'smartrecruiters', smartrecruitersSlug: 'grab'       },
  { company: 'Freshworks', ats: 'smartrecruiters', smartrecruitersSlug: 'Freshworks' },
  { company: 'ServiceNow', ats: 'smartrecruiters', smartrecruitersSlug: 'ServiceNow' },

  // ── Lever ─────────────────────────────────────────────────────────────────
  { company: 'Meesho',    ats: 'lever', leverToken: 'meesho'    },
  { company: 'CRED',      ats: 'lever', leverToken: 'cred'      },
  { company: 'Spotify',   ats: 'lever', leverToken: 'spotify'   },
  { company: 'Palantir',  ats: 'lever', leverToken: 'palantir'  },
  { company: 'Paytm',     ats: 'lever', leverToken: 'paytm'     },
  { company: 'Netomi',    ats: 'lever', leverToken: 'netomi'    },
  { company: 'Netflix',   ats: 'lever', leverToken: 'netflix'   },
  { company: 'Atlassian', ats: 'lever', leverToken: 'atlassian' },

  // ── Taleo SSR ─────────────────────────────────────────────────────────────
  {
    company:    'Deloitte',
    ats:        'taleo-ssr',
    baseUrl:    'https://usijobs.deloitte.com',
    searchPath: '/en_US/careersUSI/SearchJobs/?jobRecordsPerPage=10&jobOffset={offset}',
    selectors:  {
      card:     'article.article--result',
      title:    'h3 a',
      location: '.article__header__text__subtitle span:last-child',
      link:     'h3 a',
    },
  },

  // ── ZohoRecruit ───────────────────────────────────────────────────────────
  // Find subdomain: career page URL → {subdomain}.zohorecruit.{in|com}/jobs/Careers
  // zohorecruit.in  = India data residency (most Indian companies)
  // zohorecruit.com = Global data residency

  // ─ India / Tech ─
  { company: 'Akasa Air',            ats: 'zohorecruit', zohoSubdomain: 'akasaair',          zohoTld: 'in'  },
  { company: 'GeeksforGeeks',        ats: 'zohorecruit', zohoSubdomain: 'geeksforgeeks',      zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'Skyroot Aerospace',    ats: 'zohorecruit', zohoSubdomain: 'skyroot',            zohoTld: 'in'  },
  { company: 'Yubi',                 ats: 'zohorecruit', zohoSubdomain: 'go-yubi',            zohoTld: 'in'  },
  { company: 'Nucleus Software',     ats: 'zohorecruit', zohoSubdomain: 'nucleussoftware',    zohoTld: 'in'  },
  { company: 'Wissen Technology',    ats: 'zohorecruit', zohoSubdomain: 'wissen',             zohoTld: 'in'  },
  { company: 'MyOperator',           ats: 'zohorecruit', zohoSubdomain: 'myoperator',         zohoTld: 'in'  },
  { company: 'FYERS',                ats: 'zohorecruit', zohoSubdomain: 'fyers',              zohoTld: 'in'  },
  { company: 'ITC Limited',          ats: 'zohorecruit', zohoSubdomain: 'itcportal',          zohoTld: 'in'  },
  { company: 'Drona Aviation',       ats: 'zohorecruit', zohoSubdomain: 'dronaaviation',      zohoTld: 'in'  },
  { company: 'Arting Digital',       ats: 'zohorecruit', zohoSubdomain: 'artingdigital',      zohoTld: 'in'  },
  { company: 'd.light',              ats: 'zohorecruit', zohoSubdomain: 'dlight',             zohoTld: 'in'  },
  { company: 'Wadhwani AI',          ats: 'zohorecruit', zohoSubdomain: 'wadhwaniai',         zohoTld: 'in'  },
  { company: 'Axis My India',        ats: 'zohorecruit', zohoSubdomain: 'axismyindia',        zohoTld: 'in'  },
  { company: 'Encalm',               ats: 'zohorecruit', zohoSubdomain: 'encalm',             zohoTld: 'in'  },
  { company: 'Newslaundry',          ats: 'zohorecruit', zohoSubdomain: 'newslaundry',        zohoTld: 'in'  },
  { company: 'e6data',               ats: 'zohorecruit', zohoSubdomain: 'e6data',             zohoTld: 'in'  },
  { company: 'Innofied',             ats: 'zohorecruit', zohoSubdomain: 'innofied',           zohoTld: 'in'  },
  { company: 'Peepul India',         ats: 'zohorecruit', zohoSubdomain: 'peepulindia',        zohoTld: 'in'  },
  { company: 'Jungleworks',          ats: 'zohorecruit', zohoSubdomain: 'jungleworks',        zohoTld: 'in'  },
  { company: 'Agivant Technologies', ats: 'zohorecruit', zohoSubdomain: 'agivant',            zohoTld: 'in'  },
  { company: 'Agrim',                ats: 'zohorecruit', zohoSubdomain: 'agrim',              zohoTld: 'in'  },
  { company: 'RaftLabs',             ats: 'zohorecruit', zohoSubdomain: 'raftlabs',           zohoTld: 'in'  },
  { company: 'FyerX',                ats: 'zohorecruit', zohoSubdomain: 'fyerx',              zohoTld: 'in'  },
  { company: 'Groupsoft',            ats: 'zohorecruit', zohoSubdomain: 'groupsoftus',        zohoTld: 'in'  },
  { company: 'Armory Shield',        ats: 'zohorecruit', zohoSubdomain: 'armoryshield',       zohoTld: 'in'  },
  { company: 'Nopal Cyber',          ats: 'zohorecruit', zohoSubdomain: 'nopalcyber',         zohoTld: 'in'  },
  { company: 'Rare Ideas',           ats: 'zohorecruit', zohoSubdomain: 'rare-ideas',         zohoTld: 'in'  },
  { company: 'Borderless',           ats: 'zohorecruit', zohoSubdomain: 'borderless',         zohoTld: 'in'  },
  { company: 'Oxane Partners',       ats: 'zohorecruit', zohoSubdomain: 'oxanepartners',      zohoTld: 'in'  },
  { company: 'Money Forward India',  ats: 'zohorecruit', zohoSubdomain: 'moneyforward',       zohoTld: 'in'  },
  { company: 'MoneyMul',             ats: 'zohorecruit', zohoSubdomain: 'moneymul',           zohoTld: 'in'  },
  { company: 'Operisoft',            ats: 'zohorecruit', zohoSubdomain: 'operisoft',          zohoTld: 'in'  },
  { company: 'AddWeb Solution',      ats: 'zohorecruit', zohoSubdomain: 'addwebsolution',     zohoTld: 'in'  },
  { company: 'Eloit Innovation',     ats: 'zohorecruit', zohoSubdomain: 'eloit',              zohoTld: 'in'  },
  { company: 'Genuin',               ats: 'zohorecruit', zohoSubdomain: 'begenuin',           zohoTld: 'in'  },
  { company: 'Linkwave Technologies',ats: 'zohorecruit', zohoSubdomain: 'linkwave',           zohoTld: 'in'  },
  { company: 'Cobay',                ats: 'zohorecruit', zohoSubdomain: 'cobay',              zohoTld: 'in'  },
  { company: 'Aivar Innovations',    ats: 'zohorecruit', zohoSubdomain: 'aivar',              zohoTld: 'in'  },
  { company: 'Collective Newsroom',  ats: 'zohorecruit', zohoSubdomain: 'collectivenewsroom', zohoTld: 'in'  },
  { company: 'FCI-CCM',              ats: 'zohorecruit', zohoSubdomain: 'fci-ccm',            zohoTld: 'in'  },
  { company: 'Esyasoft',             ats: 'zohorecruit', zohoSubdomain: 'esyasoft',           zohoTld: 'in'  },
  { company: 'Zigram',               ats: 'zohorecruit', zohoSubdomain: 'zigram',             zohoTld: 'in'  },

  // ─ India / Staffing & Consulting ─
  { company: 'Right Advisors',       ats: 'zohorecruit', zohoSubdomain: 'rightadvisors',      zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'The Closing Gap',      ats: 'zohorecruit', zohoSubdomain: 'theclosinggap',      zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'IGSSL',                ats: 'zohorecruit', zohoSubdomain: 'igssl',              zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'Truviq Systems',       ats: 'zohorecruit', zohoSubdomain: 'truviqsystems',      zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'Thoucentric',          ats: 'zohorecruit', zohoSubdomain: 'thoucentric',        zohoTld: 'in'  },
  { company: 'Blend360',             ats: 'zohorecruit', zohoSubdomain: 'blend360',           zohoTld: 'in'  },
  { company: 'Alliantgroup',         ats: 'zohorecruit', zohoSubdomain: 'alliantgroup',       zohoTld: 'in'  },
  { company: 'Tecvesten Consulting', ats: 'zohorecruit', zohoSubdomain: 'tecvesten',          zohoTld: 'in'  },
  { company: 'Exavalu',              ats: 'zohorecruit', zohoSubdomain: 'exavalu',            zohoTld: 'in'  },
  { company: 'Aparajitha Corporate', ats: 'zohorecruit', zohoSubdomain: 'aparajitha',         zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'StatusNeo',            ats: 'zohorecruit', zohoSubdomain: 'statusneo',          zohoTld: 'in'  },
  { company: 'CEDMAP India',         ats: 'zohorecruit', zohoSubdomain: 'cedmapindia',        zohoTld: 'in'  },
  { company: 'BCE Global Tech',      ats: 'zohorecruit', zohoSubdomain: 'bceglobaltech',      zohoTld: 'in'  },
  { company: 'Thinkbridge',          ats: 'zohorecruit', zohoSubdomain: 'thinkbridge',        zohoTld: 'in'  },
  { company: 'Kawenmanpower',        ats: 'zohorecruit', zohoSubdomain: 'kawenmanpower',      zohoTld: 'in'  },
  { company: 'Cynosure Jobs',        ats: 'zohorecruit', zohoSubdomain: 'cynosurejobs',       zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'Overture Rede',        ats: 'zohorecruit', zohoSubdomain: 'overturerede',       zohoTld: 'in'  },
  { company: 'Zyphra Tech Solutions',ats: 'zohorecruit', zohoSubdomain: 'zyphratechsolutions', zohoTld: 'in' },
  { company: 'Gravitix Tech',        ats: 'zohorecruit', zohoSubdomain: 'gravitixtechsolutions', zohoTld: 'in' },
  { company: 'Karomi',               ats: 'zohorecruit', zohoSubdomain: 'karomi',             zohoTld: 'in'  },

  // ─ India / Finance ─
  { company: 'PNBCSL',               ats: 'zohorecruit', zohoSubdomain: 'pnbcsl',             zohoTld: 'in'  },
  { company: 'Bajaj Finserv',        ats: 'zohorecruit', zohoSubdomain: 'bajajfinserv',        zohoTld: 'in'  },
  { company: 'Arka Fincap',          ats: 'zohorecruit', zohoSubdomain: 'arkafincap',          zohoTld: 'in'  },
  { company: 'Finnovate',            ats: 'zohorecruit', zohoSubdomain: 'finnovate',           zohoTld: 'in'  },
  { company: 'Remitap',              ats: 'zohorecruit', zohoSubdomain: 'remitap',             zohoTld: 'in'  },
  { company: 'Eko',                  ats: 'zohorecruit', zohoSubdomain: 'eko',                 zohoTld: 'in'  },
  { company: 'MSF India',            ats: 'zohorecruit', zohoSubdomain: 'msfindia',            zohoTld: 'in'  },

  // ─ India / NGO & Social ─
  { company: 'Bhumi',                ats: 'zohorecruit', zohoSubdomain: 'bhumi',              zohoTld: 'in'  },
  { company: 'NIIT Foundation',      ats: 'zohorecruit', zohoSubdomain: 'niitfoundation',     zohoTld: 'in'  },
  { company: 'YRG Care',             ats: 'zohorecruit', zohoSubdomain: 'yrgcare',            zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'Daya Rehabilitation',  ats: 'zohorecruit', zohoSubdomain: 'thanal',             zohoTld: 'in'  },
  { company: 'JGC India EPC',        ats: 'zohorecruit', zohoSubdomain: 'jgc',                zohoTld: 'in'  },
  { company: 'Acowale',              ats: 'zohorecruit', zohoSubdomain: 'acowale',            zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'StreetGains',          ats: 'zohorecruit', zohoSubdomain: 'streetgains',        zohoTld: 'in'  },
  { company: 'Futureacad',           ats: 'zohorecruit', zohoSubdomain: 'futureacad',         zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'BPK Tech',             ats: 'zohorecruit', zohoSubdomain: 'bpktech',            zohoTld: 'in'  },
  { company: 'Tecell',               ats: 'zohorecruit', zohoSubdomain: 'tecell',             zohoTld: 'in'  },
  { company: 'Noblq',                ats: 'zohorecruit', zohoSubdomain: 'noblq',              zohoTld: 'in'  },
  { company: 'India Market Entry',   ats: 'zohorecruit', zohoSubdomain: 'indiamarketentry',   zohoTld: 'in'  },
  { company: 'Twinleaves Retail',    ats: 'zohorecruit', zohoSubdomain: 'twinleaves',         zohoTld: 'in'  },
  { company: 'Assure Clinic',        ats: 'zohorecruit', zohoSubdomain: 'assureclinic',       zohoTld: 'in'  },
  { company: 'Secure Network Solutions', ats: 'zohorecruit', zohoSubdomain: 'snsin',          zohoTld: 'in'  },
  { company: 'CSC e-Governance',     ats: 'zohorecruit', zohoSubdomain: 'csc',                zohoTld: 'in'  },
  { company: '2Base Technologies',   ats: 'zohorecruit', zohoSubdomain: '2basetechnologies',  zohoTld: 'in'  },
  { company: 'Nebulaa IT Solutions', ats: 'zohorecruit', zohoSubdomain: 'nebulaaitsolutions', zohoTld: 'in'  },
  { company: 'Zikra Infotech',       ats: 'zohorecruit', zohoSubdomain: 'zikrainfotech',      zohoTld: 'in'  },
  { company: 'Accelon Consulting',   ats: 'zohorecruit', zohoSubdomain: 'accelonconsulting',  zohoTld: 'in'  },
  { company: 'Propella Search',      ats: 'zohorecruit', zohoSubdomain: 'propellasearch',     zohoTld: 'in'  },
  { company: 'Fishman Healthcare',   ats: 'zohorecruit', zohoSubdomain: 'fishmanhealthcare',  zohoTld: 'in', zohoPagename: 'careers' },
  { company: 'Seema Hospital',       ats: 'zohorecruit', zohoSubdomain: 'seemahospital',      zohoTld: 'in'  },
  { company: 'Eveo',                 ats: 'zohorecruit', zohoSubdomain: 'eveo',               zohoTld: 'in'  },

  // ─ Global / zohorecruit.com ─
  { company: 'Increff',              ats: 'zohorecruit', zohoSubdomain: 'increff',            zohoTld: 'com', zohoPagename: 'careers' },
  { company: 'Quest Alliance',       ats: 'zohorecruit', zohoSubdomain: 'questalliance',      zohoTld: 'com', zohoPagename: 'careers' },
  { company: 'GNH India',            ats: 'zohorecruit', zohoSubdomain: 'gnhindia',           zohoTld: 'com'  },
  { company: 'Give India',           ats: 'zohorecruit', zohoSubdomain: 'giveindia',          zohoTld: 'com'  },
  { company: 'Indus Action',         ats: 'zohorecruit', zohoSubdomain: 'indusaction',        zohoTld: 'com'  },
  { company: 'vCommission',          ats: 'zohorecruit', zohoSubdomain: 'vcommission',        zohoTld: 'com'  },
  { company: 'Talenture',            ats: 'zohorecruit', zohoSubdomain: 'talenture',          zohoTld: 'com'  },
  { company: 'Bruntwork',            ats: 'zohorecruit', zohoSubdomain: 'bruntwork',          zohoTld: 'com'  },
  { company: 'Execo',                ats: 'zohorecruit', zohoSubdomain: 'execo',              zohoTld: 'com'  },
  { company: 'Infinit-O',            ats: 'zohorecruit', zohoSubdomain: 'infinit-o',          zohoTld: 'com'  },
  { company: 'OTSI Global',          ats: 'zohorecruit', zohoSubdomain: 'otsi-global',        zohoTld: 'com'  },
  { company: 'Saras Analytics',      ats: 'zohorecruit', zohoSubdomain: 'sarasanalytics',     zohoTld: 'com'  },
  { company: 'Techvaria',            ats: 'zohorecruit', zohoSubdomain: 'techvaria',          zohoTld: 'com'  },
  { company: 'iLink Digital',        ats: 'zohorecruit', zohoSubdomain: 'ilink-digital',      zohoTld: 'com'  },
  { company: 'COURE Software',       ats: 'zohorecruit', zohoSubdomain: 'coure-tech',         zohoTld: 'com'  },
  { company: 'Proactive Data Systems', ats: 'zohorecruit', zohoSubdomain: 'proactive',        zohoTld: 'com'  },
  { company: 'MyOperator Careers',    ats: 'zohorecruit', zohoSubdomain: 'myoperator-careers', zohoTld: 'com' },
  { company: 'Sectona',              ats: 'zohorecruit', zohoSubdomain: 'sectona',            zohoTld: 'com'  },
  { company: 'Seclore',              ats: 'zohorecruit', zohoSubdomain: 'seclore',            zohoTld: 'com', zohoPagename: 'careers' },
  { company: 'Wadhwani Foundation',  ats: 'zohorecruit', zohoSubdomain: 'wfglobal',           zohoTld: 'com'  },
  { company: 'Exito Media',          ats: 'zohorecruit', zohoSubdomain: 'exito-e',            zohoTld: 'com'  },
  { company: 'OSF Digital',          ats: 'zohorecruit', zohoSubdomain: 'osf-global',         zohoTld: 'com'  },
  { company: 'Scopic Software',      ats: 'zohorecruit', zohoSubdomain: 'scopicsoftware',     zohoTld: 'com'  },
  { company: 'Fulcrum Digital',      ats: 'zohorecruit', zohoSubdomain: 'fulcrumdigital',     zohoTld: 'com', zohoPagename: 'careers' },
  { company: 'ITP Media Group',      ats: 'zohorecruit', zohoSubdomain: 'itp',                zohoTld: 'com'  },
  { company: 'Sharaf DG',            ats: 'zohorecruit', zohoSubdomain: 'sharafdg',           zohoTld: 'com', zohoPagename: 'careers' },
  { company: 'NextRow Digital',      ats: 'zohorecruit', zohoSubdomain: 'nextrow',            zohoTld: 'com'  },
  { company: 'IndiaNIC Infotech',    ats: 'zohorecruit', zohoSubdomain: 'indianic',           zohoTld: 'com'  },
  { company: 'Chimera Technologies', ats: 'zohorecruit', zohoSubdomain: 'chimeratechnologies', zohoTld: 'com' },
  { company: 'Outsource Access',     ats: 'zohorecruit', zohoSubdomain: 'outsourceaccess',    zohoTld: 'com'  },
  { company: 'TheHireBoost',         ats: 'zohorecruit', zohoSubdomain: 'thehireboost',       zohoTld: 'com'  },
  { company: 'Pasona',               ats: 'zohorecruit', zohoSubdomain: 'pasona',             zohoTld: 'com', zohoPagename: 'careers' },
  { company: 'HivePro',              ats: 'zohorecruit', zohoSubdomain: 'hivepro',            zohoTld: 'com'  },
  { company: 'Tagglabs',             ats: 'zohorecruit', zohoSubdomain: 'tagglabs',           zohoTld: 'com'  },

];

const withDefaults = sources.map(s => ({ ...DEFAULTS, ...s }));

// Primary export: injected array (backward-compatible with all existing requires)
module.exports = withDefaults;

// Named exports for scripts that need the raw list or DEFAULTS separately
module.exports.raw      = sources;
module.exports.DEFAULTS = DEFAULTS;
