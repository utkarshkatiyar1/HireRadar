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
  { company: 'HubSpot',      ats: 'greenhouse', greenhouseToken: 'hubspot'                    },
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

  // ── Ashby ─────────────────────────────────────────────────────────────────
  { company: 'Notion',     ats: 'ashby', ashbySlug: 'notion'     },
  { company: 'ClickUp',    ats: 'ashby', ashbySlug: 'clickup'    },
  { company: 'Linear',     ats: 'ashby', ashbySlug: 'linear'     },
  { company: 'Sentry',     ats: 'ashby', ashbySlug: 'sentry'     },
  { company: 'Supabase',   ats: 'ashby', ashbySlug: 'supabase'   },
  { company: 'Ramp',       ats: 'ashby', ashbySlug: 'ramp'       },
  { company: 'Deel',       ats: 'ashby', ashbySlug: 'deel'       },
  { company: 'Replit',     ats: 'ashby', ashbySlug: 'replit'     },
  { company: 'Snowflake',  ats: 'ashby', ashbySlug: 'snowflake'  },
  { company: 'Confluent',  ats: 'ashby', ashbySlug: 'confluent'  },
  { company: 'Redis',      ats: 'ashby', ashbySlug: 'redis'      },
  { company: 'Plaid',      ats: 'ashby', ashbySlug: 'plaid'      },

  // ── SmartRecruiters ───────────────────────────────────────────────────────
  { company: 'Canva',      ats: 'smartrecruiters', smartrecruitersSlug: 'Canva'      },
  { company: 'Grab',       ats: 'smartrecruiters', smartrecruitersSlug: 'grab'       },
  { company: 'Grafana',    ats: 'smartrecruiters', smartrecruitersSlug: 'Grafana'    },
  { company: 'Freshworks', ats: 'smartrecruiters', smartrecruitersSlug: 'Freshworks' },
  { company: 'HashiCorp',  ats: 'smartrecruiters', smartrecruitersSlug: 'HashiCorp'  },

  // ── Lever ─────────────────────────────────────────────────────────────────
  { company: 'Meesho',    ats: 'lever', leverToken: 'meesho'    },
  { company: 'CRED',      ats: 'lever', leverToken: 'cred'      },
  { company: 'Spotify',   ats: 'lever', leverToken: 'spotify'   },
  { company: 'Palantir',  ats: 'lever', leverToken: 'palantir'  },

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

];

// Inject DEFAULTS into every source (per-source overrides win).
module.exports = sources.map(s => ({ ...DEFAULTS, ...s }));
