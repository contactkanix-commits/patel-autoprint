const DEFAULT_PRICING = {
  bwPerPage: 1,
  colorPerPage: 5,
  colorDuplexPerPage: 10,
};

function calculatePrice(totalPages, colorPages, settings, config = DEFAULT_PRICING) {
  const bwPages = totalPages - colorPages;
  const isNup = (settings.pagesPerSheet || 1) > 1;
  const copies = settings.copies || 1;
  const printStyle = settings.printStyle || 'single';

  const sheetsForPages = (pages) => {
    const nupAdjusted = isNup ? Math.ceil(pages / settings.pagesPerSheet) : pages;
    if (printStyle === 'duplex') return Math.ceil(nupAdjusted / 2);
    return nupAdjusted;
  };

  const bwSheets = sheetsForPages(bwPages);
  const colorSheets = sheetsForPages(colorPages);

  const isColorDuplex = settings.colorMode === 'color' && printStyle === 'duplex';
  const colorRate = isColorDuplex ? config.colorDuplexPerPage : config.colorPerPage;

  const baseBwPrice = bwSheets * config.bwPerPage;
  const baseColorPrice = colorSheets * colorRate;
  const subtotal = baseBwPrice + baseColorPrice;
  const total = Math.round(subtotal * copies * 100) / 100;

  const breakdown = [{ label: `B/W (${bwSheets} sheets × ₹${config.bwPerPage})`, amount: baseBwPrice }];

  if (colorSheets > 0) {
    const rateLabel = isColorDuplex ? `₹${config.colorDuplexPerPage}` : `₹${config.colorPerPage}`;
    breakdown.push({ label: `Color (${colorSheets} sheets × ${rateLabel})`, amount: baseColorPrice });
  }

  if (copies > 1) {
    breakdown.push({ label: `Copies (×${copies})`, amount: Math.round((subtotal * (copies - 1)) * 100) / 100 });
  }

  return {
    basePrice: baseBwPrice + baseColorPrice,
    subtotal: total,
    discount: 0,
    tax: 0,
    total,
    breakdown: breakdown.map(b => ({ ...b, amount: Math.round(b.amount * 100) / 100 })),
  };
}

module.exports = { calculatePrice, DEFAULT_PRICING };
