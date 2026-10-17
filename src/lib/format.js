// Turns a transactions row into what the app sees, from the logged-in user's side.
function formatTransaction(row, me) {
  const sent = row.from_account === me;
  const fee = sent ? row.fee : 0; // the receiver never pays the fee
  return {
    id: row.id,
    type: sent ? 'sent' : 'received',
    amount: row.amount,
    fee,
    total: row.amount + fee,
    counterparty: sent
      ? { id: row.to_account, name: row.to_name }
      : { id: row.from_account, name: row.from_name },
    note: row.note,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function formatContact(row) {
  return { id: row.id, accountId: row.contact_account_id, name: row.name, favourite: row.favourite };
}

module.exports = { formatTransaction, formatContact };
