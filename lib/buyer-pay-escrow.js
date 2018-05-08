/* global getCurrentParticipant getAssetRegistry getParticipantRegistry query getFactory emit */


/**
 * Get namespace
 * @returns {string}
 */
function getNamespace() {
    return 'org.finance.payment';
}

/**
 * Get namespace for composer type
 * @param {string} type - hyperledger composer model type
 * @returns {string} namespace
 */
function getNamespaceForType(type) {
    return `${getNamespace()}.${type}`;
}

/**
 * Pay escrow
 * @param {org.finance.payment.PayEscrow} payment - the payment to be processed
 * @transaction
 */
async function payEscrow(payment) { // eslint-disable-line no-unused-vars
    const tradeRegistry = await getAssetRegistry(getNamespaceForType('Trade'));
    const accountRegistry = await getAssetRegistry(getNamespaceForType('EscrowAccount'));
    const traderRegistry = await getParticipantRegistry(getNamespaceForType('Trader'));
    const currentParticipant = getCurrentParticipant();

    // check if the status of the trade is correct
    if (payment.trade.status !== 'STEP_2_TERMS_ACCEPTED') {
        throw new Error(`the trade cannot be payed, wrong status ${payment.trade.status}`);
    }

    // check if the current participant is the buyer of the trade
    if (payment.trade.buyer.id !== currentParticipant.id) {
        throw new Error('the trader is not the buyer of the trade');
    }

    // check if the buyer has sufficient funds
    if (payment.trade.buyer.balance < payment.trade.total) {
        throw new Error('the buyer has insufficient funds');
    }

    // get or create buyer escrow account - credit buyer balance - debit escrow account
    payment.trade.buyer.balance -= payment.trade.total;
    payment.trade.status = 'STEP_3_BUYER_MOVED_FUNDS_TO_ESCROW';

    await tradeRegistry.update(payment.trade);
    await traderRegistry.update(payment.trade.buyer);

    const accounts =  await query('selectEscrowAccountsForTrader', { trader: `resource:org.finance.payment.Trader#${payment.trade.buyer.id}`});
    let account;
    if (accounts.length === 0) {
        // create new escrow account for the buyer
        account = getFactory().newResource(getNamespace(), 'EscrowAccount', Math.round((payment.timestamp).getTime() / 1000).toString());
        account.trader = payment.trade.buyer;
        account.balance += payment.trade.total;
        await accountRegistry.add(account);
    } else {
        account = accounts[0];
        account.balance += payment.trade.total;
        await accountRegistry.update(account);
    }

    // emit event
    const factory = getFactory();
    let event = factory.newEvent('org.finance.payment', 'BuyerPaidEscrowEvent');
    event.trade = payment.trade;
    emit(event);
}