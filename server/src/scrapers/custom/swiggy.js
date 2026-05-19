const axios     = require('axios');
const normalize = require('../../utils/normalize');

module.exports = async (src) => {
  const { data } = await axios.post(
    'https://swiggy.mynexthire.com/employer/careers/reqlist/get',
    { limit: 500, offset: 0 },
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':   'Mozilla/5.0',
        Accept:         'application/json',
        Origin:         'https://careers.swiggy.com',
        Referer:        'https://careers.swiggy.com/',
      },
      timeout: 15000,
    }
  );

  return (data.reqDetailsBOList ?? []).map(j => normalize({
    title:      j.reqTitle       ?? '',
    company:    'Swiggy',
    location:   (j.locationList?.[0]?.office ?? j.location ?? '').trim(),
    exp:        '',
    department: j.careerStream   ?? '',
    url:        `https://careers.swiggy.com/#/careers?src=careers&jobId=${j.reqId}`,
    date:       j.approvedOn ? new Date(j.approvedOn) : new Date(),
  }));
};
