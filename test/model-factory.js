const namespace = 'org.finance.payment';
const businessNetworkName = 'payment-network';

const types = {
    TRADE: 'Trade',
    TRADER: 'Trader',
    ACCEPT_MERCHANDISE: 'AcceptMerchandise',
    SHIP_MERCHANDISE: 'ShipMerchandise',
    ESCROW_ACCOUNT: 'EscrowAccount',
    AGREE_TERMS: 'AgreeTerms',
    START_TRADE: 'StartTrade',
    ITEM: 'Item',
    CANCEL_TRADE: 'CancelTrade',
    PAY_ESCROW: 'PayEscrow'
};


/**
 * Create trader
 * @param factory
 * @param id
 * @param firstName
 * @param lastName
 * @param email
 * @param accountId
 * @returns {Resource|any}
 */
function createTrader(factory, id, firstName, lastName, email, accountId) {
    const trader = factory.newResource(namespace, 'Trader', id.toString());
    trader.firstName = firstName;
    trader.lastName = lastName;
    trader.email = email;
    return trader;
}

/**
 * Create item
 * @param factory
 * @param id
 * @param name
 * @param salesPrice
 * @returns {Resource|any}
 */
function createItem(factory, id, name, salesPrice) {
    const item = factory.newResource(namespace, 'Item', id.toString());
    item.name = name;
    item.salesPrice = salesPrice;
    return item;
}

/**
 * Create relationship for item
 * @param factory
 * @param id
 * @returns {Relationship|any}
 */
function createRelationshipForItem(factory, id) {
    return factory.newRelationship(namespace, 'Item', id);
}

/**
 * Create relationship for trader
 * @param factory
 * @param id
 * @returns {Relationship|any}
 */
function createRelationshipForTrader(factory, id) {
    return factory.newRelationship(namespace, 'Trader', id);
}

/**
 * Create relationship for a trade
 * @param factory
 * @param id
 * @returns {Relationship|any}
 */
function createRelationshipForTrade(factory, id) {
    return factory.newRelationship(namespace, 'Trade', id);
}


/**
 * Create trade
 * @param factory
 * @param id
 * @param buyerId
 * @param sellerId
 * @param isEscrowPayment
 * @param status
 * @returns {Resource|any}
 */
function createTrade(factory, id, buyerId, sellerId, isEscrowPayment, status, isAutoPay) {
    const trade = factory.newResource(namespace, 'Trade', id.toString());
    trade.buyer = createRelationshipForTrader(factory, buyerId);
    trade.seller = createRelationshipForTrader(factory, sellerId);
    trade.isEscrowPayment = isEscrowPayment;
    trade.items = [];
    trade.status = status;
    trade.timestamp = new Date();
    trade.total = 5;
    trade.isAutoPay = isAutoPay ? isAutoPay : false;
    return trade;
}

/**
 * Create escrow account
 * @param factory
 * @param id
 * @param traderId
 * @param balance
 * @returns {Resource|any}
 */
function createEscrowAccount(factory, id, traderId, balance) {
    const account = factory.newResource(namespace, 'EscrowAccount', id.toString());
    account.trader = createRelationshipForTrader(factory, traderId);
    account.balance = balance;
    return account;
}

/**
 * Create transaction
 * @param factory
 * @param type
 * @returns {Resource|any}
 */
function createTransaction(factory, type) {
    return factory.newTransaction(namespace, type);
}

module.exports = {
    NAME_SPACE: namespace,
    BUSINESS_NETWORK_NAME: businessNetworkName,
    TYPE: types,
    createTrader: createTrader,
    createItem: createItem,
    createRelationshipForItem: createRelationshipForItem,
    createRelationshipForTrader: createRelationshipForTrader,
    createRelationshipForTrade: createRelationshipForTrade,
    createTrade: createTrade,
    createEscrowAccount: createEscrowAccount,
    createTransaction: createTransaction
};