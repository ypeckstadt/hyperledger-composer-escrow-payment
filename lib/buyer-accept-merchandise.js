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
 * Merchandise accept
 * @param {org.finance.payment.AcceptMerchandise} accept - the accept to be processed
 * @transaction
 */
async function acceptMerchandise(accept) { // eslint-disable-line no-unused-vars
    const tradeRegistry = await getAssetRegistry(getNamespaceForType('Trade'));
    const accountRegistry = await getAssetRegistry(getNamespaceForType('EscrowAccount'));
    const traderRegistry = await getParticipantRegistry(getNamespaceForType('Trader'));
    const currentParticipant = getCurrentParticipant();

    if (accept.trade.buyer.id !== currentParticipant.id) {
        throw new Error('the trader is not the buyer of this trade');
    }

    if (accept.trade.status !== 'STEP_4_MERCHANDISE_IS_SHIPPED') {
        throw new Error('the merchandise cannot be accepted yet or has already been accepted');
    }

    accept.trade.status = 'STEP_5_MERCHANDISE_IS_ACCEPTED_AND_SELLER_IS_PAID';

    await tradeRegistry.update(accept.trade);

    // Get escrow account for buyer and credit funds
    const accounts =  await query('selectEscrowAccountsForTrader', { trader: `resource:org.finance.payment.Trader#${accept.trade.buyer.$identifier}`});
    if (accounts.length === 0) {
        throw new Error('no escrow account for the buyer was found');
    }
    const buyerAccount = accounts[0];
    if (buyerAccount.balance < accept.trade.total) {
        throw new Error('the buyers escrow account has insufficient funds');
    }

    buyerAccount.balance -= accept.trade.total;

    await accountRegistry.update(buyerAccount);

    // update seller and debit funds
    accept.trade.seller.balance += accept.trade.total;

    await traderRegistry.update(accept.trade.seller);

    // emit event
    const factory = getFactory();
    let event = factory.newEvent('org.finance.payment', 'BuyerAcceptedMerchandiseEvent');
    event.trade = accept.trade;
    emit(event);
}