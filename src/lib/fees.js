// Practice fee tiers, the same ones taught on Day 2. Not real operator rates.
const MIN_TRANSFER = 100;
const MAX_TRANSFER = 500000;

function calculateFee(amount) {
  if (amount <= 5000) {
    return 50;
  } else if (amount <= 50000) {
    return 250;
  }
  return 500;
}

const FEE_TIERS = [
  { from: MIN_TRANSFER, to: 5000, fee: 50 },
  { from: 5001, to: 50000, fee: 250 },
  { from: 50001, to: MAX_TRANSFER, fee: 500 },
];

module.exports = { calculateFee, FEE_TIERS, MIN_TRANSFER, MAX_TRANSFER };
