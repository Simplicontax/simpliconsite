type CountryKey = 'us' | 'uk' | 'ca' | 'in';

type CountryService = {
  label: string;
  title: string;
  description: string;
  capabilities: Array<{ title: string; copy: string }>;
};

const services: Record<CountryKey, CountryService> = {
  us: {
    label: 'United States filing',
    title: 'Confident filing, from federal to local',
    description: 'Individual and business returns, ITIN applications, FBAR/FATCA support, amendments and audit representation.',
    capabilities: [
      { title: 'Individual returns', copy: 'Federal, state and local filing with year-round guidance.' },
      { title: 'Business returns', copy: 'Partnership, S-Corp, C-Corp and owner reporting.' },
      { title: 'Cross-border', copy: 'FBAR, FATCA, treaty positions and foreign income.' },
      { title: 'Resolution', copy: 'Amendments, notices, ITINs and audit representation.' },
    ],
  },
  uk: {
    label: 'United Kingdom filing',
    title: 'Self Assessment without the guesswork',
    description: 'Clear support for residents, landlords, directors, contractors and people with overseas income or gains.',
    capabilities: [
      { title: 'Self Assessment', copy: 'Income, allowances, reliefs and payments on account.' },
      { title: 'Property income', copy: 'UK and overseas rental reporting with expense review.' },
      { title: 'Capital gains', copy: 'Share, property and crypto disposal reporting.' },
      { title: 'Global mobility', copy: 'Residence, remittance and treaty coordination.' },
    ],
  },
  ca: {
    label: 'Canada filing',
    title: 'Personal and business returns, organized',
    description: 'T1 and self-employment filing, investment reporting, rental income and foreign asset support for Canadian taxpayers.',
    capabilities: [
      { title: 'Personal returns', copy: 'T1 filing, credits and provincial considerations.' },
      { title: 'Self-employment', copy: 'T2125 support and business expense review.' },
      { title: 'Investments', copy: 'T3, T5, T5008 and capital-gains reporting.' },
      { title: 'Foreign assets', copy: 'T1135 organization and cross-border coordination.' },
    ],
  },
  in: {
    label: 'India filing',
    title: 'India income tax filing, made clear',
    description: 'ITR filing for salaried professionals, founders, investors, property owners and NRIs—with practical document guidance.',
    capabilities: [
      { title: 'Salaried returns', copy: 'Form 16, AIS/TIS reconciliation and deduction review.' },
      { title: 'Business & profession', copy: 'Income, expenses and presumptive taxation support.' },
      { title: 'Capital gains', copy: 'Shares, mutual funds, property and digital assets.' },
      { title: 'NRI filing', copy: 'Residential status, foreign income and treaty coordination.' },
    ],
  },
};

export function initServices(): void {
  const explorer = document.querySelector<HTMLElement>('[data-service-explorer]');
  if (!explorer) return;

  const tabs = explorer.querySelectorAll<HTMLButtonElement>('[data-country]');
  const label = document.getElementById('serviceCountryLabel');
  const title = document.getElementById('serviceCountryTitle');
  const description = document.getElementById('serviceCountryDescription');
  const capabilities = document.getElementById('serviceCapabilities');
  if (!label || !title || !description || !capabilities) return;
  const labelElement = label;
  const titleElement = title;
  const descriptionElement = description;
  const capabilitiesElement = capabilities;

  function render(country: CountryKey): void {
    const detail = services[country];
    labelElement.textContent = detail.label;
    titleElement.textContent = detail.title;
    descriptionElement.textContent = detail.description;
    capabilitiesElement.innerHTML = detail.capabilities.map((item, index) => `
      <article>
        <span>${String(index + 1).padStart(2, '0')}</span>
        <h4>${item.title}</h4>
        <p>${item.copy}</p>
      </article>
    `).join('');
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const country = tab.dataset.country as CountryKey;
      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      render(country);
    });
  });

  render('us');
}
