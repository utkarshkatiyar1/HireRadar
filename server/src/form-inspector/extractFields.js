// Extracted from inspect.js so apply-adapters can re-run the same field
// extraction mid-submission (see apply-adapters/shared.js's advanceStep) —
// multi-step ATS forms (Personal Info -> Experience -> Questions -> Review,
// common on Ashby/Greenhouse custom flows) reveal each step's real fields
// only after the previous step's "Next"/"Continue" button is clicked, so a
// single inspect-time snapshot can't see them. Re-running extraction after
// every step-advance click is what lets those later-step fields actually
// get filled instead of the adapter blindly clicking whatever button it
// finds first and either stalling on an unfilled step-2 field or, worse,
// treating "advanced to step 2" as "submitted."

// Extracts visible form fields from a job application page: label + input
// type + required-ness. Best-effort, DOM-generic — real per-platform field
// mapping (e.g. Greenhouse's specific field names) lives in apply-adapters/
// at submission time; this stage only needs "what does the answer agent
// need to answer" and "can this be automated at all".
async function extractFields(page) {
  const rawFields = await page.evaluate(() => {
    const fields = [];
    // NOT scoped to `form input` — modern SPA application pages (confirmed
    // on Ashby specifically: 14 real inputs on the page, zero wrapped in a
    // <form> element, submission handled via JS/fetch instead of native
    // form submit) never matched the old `form input, form textarea, form
    // select` selector at all, so every Ashby job inspected as
    // automationCapability: NONE regardless of the real page having a
    // completely fillable application form.
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach((el) => {
      const type = el.tagName === 'TEXTAREA' ? 'textarea' : (el.tagName === 'SELECT' ? 'select' : (el.type || 'text'));
      if (['hidden', 'submit', 'button'].includes(type)) return;
      if (type === 'password') return;

      // CAPTCHA providers' own internal response fields — NOT real
      // questions, regardless of type (reCAPTCHA's is a CSS-hidden
      // <textarea>, not type="hidden", so the check above doesn't catch it).
      // A real incident: this shipped to the review UI as an answerable
      // field named "g-recaptcha-response" with 0% confidence — see
      // inspect.js's detectCaptcha, which now also checks for this element
      // directly so CAPTCHA presence is caught even when the visible widget
      // alone didn't match.
      if (/^g-recaptcha-response$|^h-captcha-response$|^cf-turnstile-response$/i.test(el.name || '')) return;

      // Widening from `form input` to a bare selector (see comment above)
      // risks picking up page-chrome inputs that have nothing to do with
      // the application itself — a real incident: a company's own site
      // search widget got extracted as "the form" on a page with no real
      // <form> at all. Skipping inputs inside <nav>/<header>/<footer> cuts
      // the most common false-positive source without needing a <form>
      // ancestor requirement that Ashby's SPA pages don't satisfy.
      if (el.closest('nav, header, footer')) return;

      // Second real incident of the same class: a Five9/Greenhouse posting's
      // page had a site-search widget that sat OUTSIDE nav/header/footer
      // (e.g. a sidebar or in-page "Search five9.com" box), so the guard
      // above didn't catch it — it shipped to the review UI as an
      // answerable field with the search box's own placeholder as its
      // "label".
      //
      // The FIRST version of this fix matched the word "search" anywhere in
      // type/name/id/placeholder/aria-label, which was too broad and caused
      // a regression: the same Five9 form's real "Location (City)" field
      // uses a Google-Places-style autocomplete whose underlying input
      // commonly carries a placeholder/aria-label mentioning "search" (e.g.
      // "Search for a city") — that blanket match excluded it along with
      // (apparently) enough of the rest of the form to zero out field
      // extraction entirely, regressing automationCapability from PARTIAL to
      // NONE on a form that's actually fully fillable. Narrowed to only
      // catch an actual SITE search box: type="search", inside a
      // [role="search"] container, or a name/id that IS (not just contains)
      // a common site-search field name — never a substring match against
      // placeholder/aria-label text, which is exactly what a legitimate
      // autocomplete field also uses.
      if (el.type === 'search' || el.closest('[role="search"]')) return;
      if (/^(s|q|search|site-search)$/i.test(el.name || el.id || '')) return;

      // aria-hidden="true": confirmed on Greenhouse's "Country" field
      // specifically — a hidden shadow <input> that react-select (and
      // similar custom-dropdown libraries) keeps around purely for its own
      // internal validation/focus-management, sitting right next to the
      // REAL visible dropdown widget. Not something a user (or this
      // pipeline) can meaningfully fill directly — the value has to go
      // through the visible control instead. This is exactly what produced
      // the empty-label "field_5"/"field_9"/etc. entries.
      if (el.getAttribute('aria-hidden') === 'true') return;

      // Label resolution, in order of reliability. Real forms (Twilio's
      // Greenhouse board, Ashby custom questions) use several of these
      // patterns beyond a plain <label for=""> — missing any one meant a
      // real, answerable question came through with an empty label and got
      // silently excluded from drafting (pipeline.js filters blank labels).
      let label = '';
      if (el.id) {
        const labelEl = document.querySelector(`label[for="${el.id}"]`);
        if (labelEl) label = labelEl.innerText.trim();
      }
      // aria-labelledby can reference one or more element ids whose text
      // makes up the accessible name — common for custom question widgets
      // (checkbox groups, custom dropdowns) that don't use a native <label>.
      if (!label && el.getAttribute('aria-labelledby')) {
        const ids = el.getAttribute('aria-labelledby').split(/\s+/);
        label = ids.map(id => document.getElementById(id)?.innerText?.trim() || '').filter(Boolean).join(' ');
      }
      if (!label && el.closest('label')) label = el.closest('label').innerText.trim();
      // <fieldset><legend>Question text</legend>...<input/></fieldset> — the
      // standard pattern for a radio/checkbox GROUP asking one question with
      // several options (e.g. Twilio's "How did you hear about us?").
      let fieldsetGroupKey = null;
      if (!label) {
        const fieldset = el.closest('fieldset');
        const legend = fieldset?.querySelector('legend');
        if (legend) label = legend.innerText.trim();
      }
      // Generic placeholder text ("Start typing...", "Select...", "Search...")
      // is a UI hint, not a description of the actual question — a real
      // incident: a rich-text/typeahead combobox's placeholder "Start
      // typing..." got used as the field's label, shipping to the review UI
      // as a meaningless answer row ("Start typing... — left blank"). Only
      // accept placeholder text that doesn't match this generic pattern.
      const GENERIC_PLACEHOLDER = /^(start typing|select|choose|search|type here|enter)\.{0,3}\s*[a-z]{0,20}\.{0,3}$/i;
      if (!label) {
        const placeholder = el.getAttribute('placeholder') || '';
        label = el.getAttribute('aria-label') || (GENERIC_PLACEHOLDER.test(placeholder.trim()) ? '' : placeholder);
      }
      // Many custom-question wrappers (React-driven dropdowns, checkbox/radio
      // groups) put the question text in a plain sibling/ancestor element
      // rather than any labeling markup at all
      // (`<div><div>Question text</div><input/></div>`) — walk up several
      // container levels looking for the nearest preceding text node.
      // Widened from 3 to 6 levels and from "immediate children only" to
      // "any text node in the subtree" after confirming real forms (Ashby
      // custom questions wrapped in multiple nested styling divs) still
      // produced blank labels at 3 levels/direct-children-only — those blank
      // labels are exactly what showed up as "field_5"/"field_9" in review,
      // silently unanswerable and impossible for a human reviewer to make
      // sense of without opening the real form.
      // Component-library-generated ids (React-select, headless-UI, etc)
      // are commonly UUIDs or UUID-shaped hashes — never real label text,
      // but a real incident had one leak through as a field's displayed
      // label (shipped to review as "ef7be49a-8818-43b5-a294-...", 0%
      // confidence, meaningless to a human reviewer). Any candidate label
      // text matching this shape is rejected outright, wherever it comes
      // from (walk-up text, group id/text, etc).
      const isUuidShaped = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^[0-9a-f]{16,}$/i.test(s);

      let groupContainer = null;
      if (!label) {
        let container = el.parentElement;
        for (let depth = 0; depth < 6 && container && !label; depth++) {
          const text = Array.from(container.querySelectorAll('*'))
            .filter(n => n !== el && !n.contains(el) && n.children.length === 0)
            .map(n => n.innerText?.trim())
            .find(t => t && t.length > 1 && t.length < 200 && !isUuidShaped(t) && !/^(select|choose|search)\.{0,3}$/i.test(t));
          if (text) { label = text; groupContainer = container; }
          container = container.parentElement;
        }
      }
      // <select>/radio-group specific: the accessible name is sometimes only
      // on the group's own wrapping <label> text content with no `for`
      // attribute at all — re-check closest('label') one more time after the
      // walk-up, since some radio buttons are individually wrapped in their
      // OPTION's label (e.g. "Yes"/"No") rather than the question's.
      if (!label && el.closest('[role="group"], [role="radiogroup"]')) {
        const group = el.closest('[role="group"], [role="radiogroup"]');
        // querySelector('legend, [id]') previously matched the FIRST element
        // with ANY id in the group — often a component-library wrapper div
        // whose id is a generated UUID/hash with no readable text of its
        // own, or whose innerText happened to just be that id showing
        // through. Prefer a real <legend> specifically; only fall back to
        // an [id] element's text if it isn't UUID-shaped.
        const legendText = group.querySelector('legend')?.innerText?.trim();
        const idElText = group.querySelector('[id]')?.innerText?.trim();
        label = group.getAttribute('aria-label')
          || legendText
          || (idElText && !isUuidShaped(idElText) ? idElText : '')
          || '';
        groupContainer = group;
      }
      if (label && isUuidShaped(label)) label = '';

      // No positional fallback (`field_${n}`) — a key/label that isn't
      // actually derived from the form is worse than surfacing the gap: it
      // silently ships to review as an unanswerable, meaningless field the
      // user can't act on, and the answer agent has zero chance of matching
      // it to any candidate fact. unresolvedLabel marks it for the review UI
      // and for form-inspector metrics instead of hiding the failure.
      const resolvedKey = el.name || el.id || null;
      const resolvedLabel = label || null;

      // groupKey identifies which logical question this checkbox/radio
      // belongs to, so groupCheckboxes() (in this same module, applied after
      // this page.evaluate() returns) can merge same-question options into
      // one multi-select field instead of N independent boolean fields with
      // no shared context. Built from the group container/fieldset/name —
      // checkboxes in a "select all that apply" widget commonly share the
      // SAME name attribute (an array-style input), which is the strongest
      // signal when present; the nearest labeled container is the fallback.
      let groupKey = null;
      if (type === 'checkbox' || type === 'radio') {
        if (el.name) groupKey = `name:${el.name}`;
        else if (fieldsetGroupKey) groupKey = fieldsetGroupKey;
        else if (groupContainer) {
          if (!groupContainer.dataset.hrGroupId) {
            groupContainer.dataset.hrGroupId = `grp_${Math.random().toString(36).slice(2, 10)}`;
          }
          groupKey = `container:${groupContainer.dataset.hrGroupId}`;
        }
      }

      // The checkbox/radio's own visible option text (e.g. "LinkedIn",
      // "Referral") — distinct from `label`, which for a grouped
      // input is the GROUP's question text ("How did you hear about us?").
      // Needed by groupCheckboxes() to build each option's display value.
      let optionText = null;
      if (type === 'checkbox' || type === 'radio') {
        if (el.id) {
          const optLabel = document.querySelector(`label[for="${el.id}"]`);
          if (optLabel) optionText = optLabel.innerText.trim();
        }
        if (!optionText && el.closest('label')) optionText = el.closest('label').innerText.trim();
        if (!optionText) optionText = el.value || resolvedLabel;
      }

      fields.push({
        key: resolvedKey || resolvedLabel || `unresolved_${fields.length}`,
        label: resolvedLabel ? resolvedLabel.slice(0, 200) : null,
        fieldType: type,
        required: el.required || el.getAttribute('aria-required') === 'true',
        unresolvedLabel: !resolvedLabel,
        groupKey,
        optionText: optionText ? optionText.slice(0, 200) : null,
      });
    });
    return fields;
  });

  return groupCheckboxes(rawFields);
}

// Merges checkbox/radio inputs that share a groupKey into ONE logical
// multi-select field (fieldType: 'checkbox-group') carrying all its option
// texts, instead of leaving them as N independent boolean fields the answer
// agent has no way to reason about together — previously there was no
// coordination at all for "select all that apply" widgets: each checkbox
// was answered (or left blank) in isolation, with no sense of "which of
// these N boxes should be checked" as a single decision.
//
// Radios in the SAME group are collapsed too (single-select — the answer
// agent picks one optionText as the value) since the underlying problem
// (N independently-reasoned inputs for one real question) is identical.
function groupCheckboxes(fields) {
  const groups = new Map();
  const result = [];

  for (const field of fields) {
    const isGroupable = (field.fieldType === 'checkbox' || field.fieldType === 'radio') && field.groupKey;
    if (!isGroupable) {
      result.push(field);
      continue;
    }
    if (!groups.has(field.groupKey)) {
      const grouped = {
        key: field.groupKey,
        label: field.label,
        fieldType: field.fieldType === 'radio' ? 'radio-group' : 'checkbox-group',
        required: field.required,
        unresolvedLabel: field.unresolvedLabel,
        options: [],
      };
      groups.set(field.groupKey, grouped);
      result.push(grouped);
    }
    const grouped = groups.get(field.groupKey);
    grouped.required = grouped.required || field.required;
    grouped.options.push({ key: field.key, optionText: field.optionText });
  }

  // A "group" with exactly one option isn't really a group (a lone checkbox
  // that happened to get a groupKey, e.g. a single consent checkbox inside
  // its own container) — leave those as plain checkbox/radio fields so the
  // existing single-checkbox fill path (fillField in shared.js) still
  // handles them, rather than forcing every checkbox through the group path.
  return result.map(f => {
    if ((f.fieldType === 'checkbox-group' || f.fieldType === 'radio-group') && f.options.length === 1) {
      const opt = f.options[0];
      return { key: opt.key, label: f.label, fieldType: f.fieldType === 'radio-group' ? 'radio' : 'checkbox', required: f.required, unresolvedLabel: f.unresolvedLabel };
    }
    return f;
  });
}

module.exports = { extractFields, groupCheckboxes };
