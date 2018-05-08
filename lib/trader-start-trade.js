/* global getParticipantRegistry getCurrentParticipant getAssetRegistry getFactory emit */

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
 * Create trade asset
 * @param {org.finance.payment.StartTrade} tradeRequest - request for trade
 * @param {org.finance.payment.Trader} currentParticipant - trader who started the transaction
 * @param {org.finance.payment.TradeStatus} status - status of the trade
 * @returns {Promise<void>}
 */
async function createTrade(tradeRequest, currentParticipant, status, totalAmount) {
    const tradeRegistry = await getAssetRegistry(getNamespaceForType('Trade'));
    const trade = getFactory().newResource(getNamespace(), 'Trade', Math.round((tradeRequest.timestamp).getTime() / 1000).toString());
    trade.timestamp = tradeRequest.timestamp;
    trade.buyer = currentParticipant;
    trade.seller = tradeRequest.trader;
    trade.isEscrowPayment = false;
    trade.items = tradeRequest.items;
    trade.status = status;
    trade.total = totalAmount;
    trade.isAutoPay = tradeRequest.isAutoPay;

    await tradeRegistry.add(trade);
    return trade;
}

/**
 * Direct payment
 * @param {org.finance.payment.StartTrade} tradeRequest - request for trade
 * @param {org.finance.payment.Trader} currentParticipant - trader who started the transaction
 * @returns {Promise<void>}
 */
async function directPayment(tradeRequest, currentParticipant) {
    const traderRegistry = await getParticipantRegistry(getNamespaceForType('Trader'));
    let transactionSum = 0;

    for (const item of tradeRequest.items) {
        transactionSum += item.salesPrice;
    }

    if (currentParticipant.balance < transactionSum) {
        throw new Error('the buyer has insufficient funds to make this transaction');
    }

    tradeRequest.trader.balance += transactionSum;
    currentParticipant.balance -= transactionSum;


    await traderRegistry.updateAll([tradeRequest.trader, currentParticipant]);

    return await createTrade(tradeRequest, currentParticipant, 'STEP_1_DIRECT_PAYMENT_COMPLETED', transactionSum);
}

/**
 * Start escrow payment
 * @param {org.finance.payment.StartTrade} tradeRequest - the trade request to be processed
 * @param {org.finance.payment.Trader} currentParticipant - trader who started the transaction
 * @returns {Promise<void>}
 */
async function escrowPayment(tradeRequest, currentParticipant) {
    let transactionSum = 0;

    for (const item of tradeRequest.items) {
        transactionSum += item.salesPrice;
    }

    const buyer = tradeRequest.isStartedBySeller ? tradeRequest.trader : currentParticipant;
    if (buyer.balance < transactionSum) {
        throw new Error('the buyer has insufficient funds to make this transaction');
    }

    return await createTrade(tradeRequest, currentParticipant, 'STEP_1_WAITING_FOR_TERMS_AGREEMENT', transactionSum);
}

/**
 * Start a trade
 * @param {org.finance.payment.StartTrade} tradeRequest - the trade request to be processed
 * @transaction
 */
async function startTrade(tradeRequest) { // eslint-disable-line no-unused-vars
    if (tradeRequest.items.length === 0) {
        throw new Error('a trade needs to have items');
    }

    let trade;

    if (tradeRequest.isEscrowPayment) {
        trade = await escrowPayment(tradeRequest, getCurrentParticipant());
    } else {
        if (tradeRequest.isStartedBySeller) {
            throw new Error('a direct payment can only be started by the buyer');
        }
        trade = await directPayment(tradeRequest, getCurrentParticipant());
    }

    // emit event
    const factory = getFactory();
    let event = factory.newEvent('org.finance.payment', 'TraderStartsTradeEvent');
    event.trade = trade;
    event.trader = await getCurrentParticipant();
    event.isEscrowPayment = tradeRequest.isEscrowPayment;
    emit(event);
}