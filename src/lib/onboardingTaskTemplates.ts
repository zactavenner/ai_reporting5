export function getTemplatesForClientType(clientType?: string | null) {
  const tasks = [
    { category: 'Setup', title: 'Complete client intake form', sort_order: 1 },
    { category: 'Setup', title: 'Upload brand assets (logo, colors, fonts)', sort_order: 2 },
    { category: 'Setup', title: 'Connect GHL sub-account', sort_order: 3 },
    { category: 'Setup', title: 'Set up pipelines & calendar mappings', sort_order: 4 },
    { category: 'Setup', title: 'Configure webhook mappings', sort_order: 5 },
    { category: 'Ads', title: 'Connect Meta ad account', sort_order: 6 },
    { category: 'Ads', title: 'Install Meta pixel on website', sort_order: 7 },
    { category: 'Ads', title: 'Create first ad campaign', sort_order: 8 },
    { category: 'Ads', title: 'Upload initial creatives', sort_order: 9 },
    { category: 'Funnel', title: 'Set up landing page', sort_order: 10 },
    { category: 'Funnel', title: 'Set up booking page', sort_order: 11 },
    { category: 'Funnel', title: 'Configure email/SMS sequences', sort_order: 12 },
    { category: 'Fulfillment', title: 'Generate research report', sort_order: 13 },
    { category: 'Fulfillment', title: 'Generate marketing angles', sort_order: 14 },
    { category: 'Fulfillment', title: 'Generate ad copy & scripts', sort_order: 15 },
    { category: 'Launch', title: 'Client kickoff call completed', sort_order: 16 },
    { category: 'Launch', title: 'Verify pixel tracking', sort_order: 17 },
    { category: 'Launch', title: 'Launch ads', sort_order: 18 },
  ];

  return tasks;
}
