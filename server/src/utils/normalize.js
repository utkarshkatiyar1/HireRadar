module.exports = function normalize(job) {
  return {
    title:      (job.title      || '').trim(),
    company:    (job.company    || '').trim(),
    location:   (job.location   || '').trim(),
    exp:        String(job.exp  ?? '').trim(),
    department: (job.department || '').trim(),
    url:        (job.url        || '').trim(),
    date:       job.date instanceof Date ? job.date : new Date(job.date || Date.now()),
  };
};
