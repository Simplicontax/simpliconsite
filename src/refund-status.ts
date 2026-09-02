type Department = [label: string, url: string];

const stateDepartments: Department[] = [
  ['AL', 'https://myalabamataxes.alabama.gov/_/'], ['AK', 'https://tax.alaska.gov/'], ['AZ', 'https://www.aztaxes.gov/Home/Page'],
  ['AR', 'https://www.dfa.arkansas.gov/income-tax/individual-income-tax/wheres-my-refund/'], ['CA', 'https://webapp.ftb.ca.gov/Refund/Login.aspx?Lang=en-us'],
  ['CO', 'https://www.colorado.gov/revenueonline/_/'], ['CT', 'https://drsindtax.ct.gov/AUT/welcomeindividual.aspx'],
  ['DE', 'https://dorweb.revenue.delaware.gov/scripts/refinq/refinq.dll'], ['DC', 'https://mytax.dc.gov/_/#1'],
  ['GA', 'https://dor.georgia.gov/taxes/wheres-my-refund'], ['HI', 'https://tax.hawaii.gov/refund/'], ['ID', 'https://tax.idaho.gov/where-is-my-refund/'],
  ['IL', 'https://mytax.illinois.gov/_/'], ['IN', 'https://secure.in.gov/apps/dor/tax-refund/'], ['IA', 'https://tax.iowa.gov/wheres-my-refund'],
  ['KS', 'https://www.kdor.ks.gov/Apps/Tax/RefundStatus'], ['KY', 'https://revenue.ky.gov/Individual/Refunds/Pages/default.aspx'],
  ['LA', 'https://revenue.louisiana.gov/IndividualIncomeTax/RefundStatus'], ['ME', 'https://revenue.maine.gov/online/individual-income-tax-refund-status'],
  ['MD', 'https://interactive.marylandtaxes.gov/Individuals/itd/refundstatus'], ['MA', 'https://www.mass.gov/how-to/check-the-status-of-your-tax-refund'],
  ['MI', 'https://www.michigan.gov/taxes/iit/refund'], ['MN', 'https://revenue.state.mn.us/wheres-my-refund'],
  ['MS', 'https://dor.ms.gov/individual/Pages/Individual-Income-Tax-Refund-Status.aspx'], ['MO', 'https://dor.mo.gov/taxation/individual/tax-types/income/refund/'],
  ['MT', 'https://revenue.mt.gov/Individual/Individual-Income-Tax/Refunds'], ['NE', 'https://revenue.nebraska.gov/individuals/individual-income-tax/refund-status'],
  ['NJ', 'https://www.nj.gov/treasury/taxation/refund/index.shtml'], ['NM', 'https://tax.newmexico.gov/individuals/refund-status'],
  ['NY', 'https://www.tax.ny.gov/pmts/refund/'], ['NC', 'https://www.ncdor.gov/taxes-forms/individual-income-tax/refund-status'],
  ['ND', 'https://www.tax.nd.gov/individual-income-tax/refund-status'], ['OH', 'https://tax.ohio.gov/individual/refund'],
  ['OK', 'https://ok.gov/tax/refund-status'], ['OR', 'https://www.oregon.gov/dor/programs/individuals/Pages/refund.aspx'],
  ['PA', 'https://mypath.pa.gov/_/'], ['RI', 'https://tax.ri.gov/refund/'], ['SC', 'https://dor.sc.gov/taxpayer-services/refund-status'],
  ['UT', 'https://tap.tax.utah.gov/TaxExpress/_/'], ['VT', 'https://tax.vermont.gov/individuals/refund'],
  ['VA', 'https://tax.virginia.gov/individual-tax/refund'], ['WV', 'https://mytaxes.wvtax.gov/_/'],
  ['WI', 'https://revenue.wi.gov/Pages/OnlineServices/refundstatus.aspx'],
];

const paymentStateDepartments: Department[] = [
  ['AL', 'https://myalabamataxes.alabama.gov/'], ['AK', 'https://tax.alaska.gov/'], ['AZ', 'https://azdor.gov/'],
  ['AR', 'https://www.dfa.arkansas.gov/'], ['CA', 'https://www.ftb.ca.gov/'], ['CO', 'https://tax.colorado.gov/'],
  ['CT', 'https://portal.ct.gov/DRS'], ['DE', 'https://tax.delaware.gov/'], ['DC', 'https://otr.cfo.dc.gov/'],
  ['GA', 'https://dor.georgia.gov/'], ['HI', 'https://tax.hawaii.gov/'], ['ID', 'https://tax.idaho.gov/'],
  ['IL', 'https://tax.illinois.gov/'], ['IN', 'https://www.in.gov/dor/'], ['IA', 'https://tax.iowa.gov/'],
  ['KS', 'https://www.ksrevenue.gov/'], ['KY', 'https://revenue.ky.gov/'], ['LA', 'https://revenue.louisiana.gov/'],
  ['ME', 'https://www.maine.gov/revenue/'], ['MD', 'https://www.marylandtaxes.gov/'], ['MA', 'https://www.mass.gov/dor'],
  ['MI', 'https://www.michigan.gov/taxes'], ['MN', 'https://www.revenue.state.mn.us/'], ['MS', 'https://www.dor.ms.gov/'],
  ['MO', 'https://dor.mo.gov/'], ['MT', 'https://mtrevenue.gov/'], ['NE', 'https://revenue.nebraska.gov/'],
  ['NJ', 'https://www.nj.gov/treasury/taxation/'], ['NM', 'https://www.tax.newmexico.gov/'], ['NY', 'https://www.tax.ny.gov/'],
  ['NC', 'https://www.ncdor.gov/'], ['ND', 'https://www.tax.nd.gov/'], ['OH', 'https://tax.ohio.gov/'],
  ['OK', 'https://oklahoma.gov/tax.html'], ['OR', 'https://www.oregon.gov/dor'], ['PA', 'https://www.revenue.pa.gov/'],
  ['RI', 'https://tax.ri.gov/'], ['SC', 'https://dor.sc.gov/'], ['UT', 'https://tax.utah.gov/'],
  ['VT', 'https://tax.vermont.gov/'], ['VA', 'https://www.tax.virginia.gov/'], ['WA', 'https://dor.wa.gov/'],
  ['WV', 'https://tax.wv.gov/'], ['WI', 'https://www.revenue.wi.gov/'],
];
const federalRefund: Department[] = [
  ['Federal Regular', 'https://www.irs.gov/refunds'],
  ['Federal Amendment', 'https://www.irs.gov/filing/wheres-my-amended-return'],
];
const federalPayment: Department[] = [['Federal Regular', 'https://www.irs.gov/payments/direct-pay']];
const records: Department[] = [
  ['Get Transcript Online', 'https://www.irs.gov/individuals/get-transcript'],
  ['Get Transcript by Mail', 'https://www.irs.gov/individuals/get-transcript'],
];

const closeDepartmentPickers = (except?: HTMLElement): void => {
  document.querySelectorAll<HTMLElement>('.department-picker.open').forEach((picker) => {
    if (picker === except) return;
    picker.classList.remove('open');
    picker.querySelector<HTMLButtonElement>('.department-picker-trigger')?.setAttribute('aria-expanded', 'false');
  });
};

document.querySelectorAll<HTMLSelectElement>('[data-irs-select]').forEach((select) => {
  const type = select.dataset.irsType;
  const departments = type === 'refund' ? [...federalRefund, ...stateDepartments] : type === 'payment' ? [...federalPayment, ...paymentStateDepartments] : records;
  const placeholder = type === 'records' ? 'Select Transcript Method' : 'Select Department';
  select.replaceChildren(new Option(placeholder, ''));
  departments.forEach(([label, url]) => select.add(new Option(label, url)));
  const row = select.closest<HTMLElement>('[data-irs-row]') ?? select.closest<HTMLElement>('.resource-table-row');
  const go = row?.querySelector<HTMLAnchorElement>('[data-irs-go]');
  select.hidden = true;

  const picker = document.createElement('div');
  picker.className = 'department-picker';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'department-picker-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<span></span><b aria-hidden="true">⌄</b>';
  trigger.querySelector('span')!.textContent = placeholder;
  const menu = document.createElement('div');
  menu.className = 'department-picker-menu';
  menu.setAttribute('role', 'listbox');

  departments.forEach(([label, url]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'department-picker-option';
    option.setAttribute('role', 'option');
    option.textContent = label;
    option.addEventListener('click', () => {
      select.value = url;
      trigger.querySelector('span')!.textContent = label;
      select.dispatchEvent(new Event('change'));
      closeDepartmentPickers();
      trigger.focus();
    });
    menu.append(option);
  });

  picker.append(trigger, menu);
  select.insertAdjacentElement('afterend', picker);
  trigger.addEventListener('click', () => {
    const opening = !picker.classList.contains('open');
    closeDepartmentPickers(picker);
    picker.classList.toggle('open', opening);
    trigger.setAttribute('aria-expanded', String(opening));
  });

  select.addEventListener('change', () => {
    const selected = select.value;
    if (go) {
      go.href = selected || '#';
      go.setAttribute('aria-disabled', String(!selected));
      go.tabIndex = selected ? 0 : -1;
    }
  });
  go?.setAttribute('aria-disabled', 'true');
  if (go) go.tabIndex = -1;
  go?.addEventListener('click', (event) => { if (!select.value) event.preventDefault(); });
});

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('.department-picker')) closeDepartmentPickers();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDepartmentPickers(); });