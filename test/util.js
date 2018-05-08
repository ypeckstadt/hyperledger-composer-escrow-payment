const ModelFactory = require('./model-factory');
const IdCard = require('composer-common').IdCard;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const cardStore = require('composer-common').NetworkCardStoreManager.getCardStore( { type: 'composer-wallet-inmemory' } );

const connectionProfile = {
    name: 'embedded',
    'x-type': 'embedded'
};

const traders = [
    { firstName: 'aaa', lastName: 'AAA',  email: '1@testing.jp', id: '1' },
    { firstName: 'bbb', lastName: 'BBB',  email: '2@testing.jp', id: '2' },
    { firstName: 'ccc', lastName: 'CCC',  email: '3@testing.jp', id: '3' }
];


/**
 * Reconnect using a different identity.
 * @param {String} cardName The identity to use.
 * @return {Promise} A promise that will be resolved when complete.
 */
async function useIdentity(cardName, businessNetworkConnection) {
    await businessNetworkConnection.disconnect();
    businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
    await businessNetworkConnection.connect(cardName);
    return businessNetworkConnection;
}

/**
 *
 * @param {String} cardName The card name to use for this identity
 * @param {Object} identity The identity details
 * @returns {Promise} resolved when the card is imported
 */
async function importCardForIdentity(cardName, identity, adminConnection) {
    const metadata = {
        userName: identity.userID,
        version: 1,
        enrollmentSecret: identity.userSecret,
        businessNetwork: ModelFactory.BUSINESS_NETWORK_NAME
    };
    const card = new IdCard(metadata, connectionProfile);
    return adminConnection.importCard(cardName, card);
}

async function createTestTraders(businessNetworkConnection, adminConnection) {
    // get participant registry for traders
    const factory = businessNetworkConnection.getBusinessNetwork().getFactory();
    const traderRegistry = await businessNetworkConnection.getParticipantRegistry(ModelFactory.NAME_SPACE + '.Trader');

    for (const trader of traders) {
        const testTrader = ModelFactory.createTrader(factory, trader.id, trader.firstName, trader.lastName, trader.email);
        await traderRegistry.add(testTrader);
        let identity = await businessNetworkConnection.issueIdentity(`${ModelFactory.NAME_SPACE}.Trader#${testTrader.id}`, testTrader.id);
        await importCardForIdentity(testTrader.id, identity, adminConnection);
    }
}

/**
 * Connect as trader
 * @param index
 * @param businessNetworkConnection
 * @returns {Promise<*>}
 */
async function connectAsTrader(index, businessNetworkConnection) {
    let connectAs = traders[index];
    businessNetworkConnection = await useIdentity(connectAs.id, businessNetworkConnection);
    return businessNetworkConnection;
}

/**
 * Connect as network admin user
 * @param index
 * @param businessNetworkConnection
 * @returns {Promise<*>}
 */
async function connectAsAdmin(businessNetworkConnection, adminCardName) {
    businessNetworkConnection = await useIdentity(adminCardName, businessNetworkConnection);
    return businessNetworkConnection;
}

/**
 * Get registry
 * @param businessNetworkConnection
 * @param type
 * @param isParticipant
 * @returns {Promise<void>}
 */
async function getRegistry(businessNetworkConnection, type, isParticipant) {
    if (isParticipant) {
        return await businessNetworkConnection.getParticipantRegistry(ModelFactory.NAME_SPACE + '.' + type);
    } else {
        return await businessNetworkConnection.getAssetRegistry(ModelFactory.NAME_SPACE + '.' + type);
    }
}

/**
 * Get trade registry
 * @param businessNetworkConnection
 * @returns {Promise<void>}
 */
async function getTradeRegistry(businessNetworkConnection) {
    return await getRegistry(businessNetworkConnection, ModelFactory.TYPE.TRADE);
}

/**
 * Get trader registry
 * @param businessNetworkConnection
 * @returns {Promise<void>}
 */
async function getTraderRegistry(businessNetworkConnection) {
    return await getRegistry(businessNetworkConnection, ModelFactory.TYPE.TRADER, true);
}

/**
 * Get escrow account registry
 * @param businessNetworkConnection
 * @returns {Promise<void>}
 */
async function getEscrowAccountRegistry(businessNetworkConnection) {
    return await getRegistry(businessNetworkConnection, ModelFactory.TYPE.ESCROW_ACCOUNT);
}

async function getItemRegistry(businessNetworkConnection) {
    return await getRegistry(businessNetworkConnection, ModelFactory.TYPE.ITEM);
}

function getTrader(index) {
    return traders[index];
}

module.exports = {
    CONNECTION_PROFILE: connectionProfile,
    CARD_STORE: cardStore,
    useIdentity: useIdentity,
    importCardForIdentity: importCardForIdentity,
    createTestTraders: createTestTraders,
    connectAsTrader: connectAsTrader,
    connectAsAdmin: connectAsAdmin,
    getRegistry: getRegistry,
    getTradeRegistry: getTradeRegistry,
    getTraderRegistry: getTraderRegistry,
    getEscrowAccountRegistry: getEscrowAccountRegistry,
    getTrader: getTrader,
    getItemRegistry: getItemRegistry
};

