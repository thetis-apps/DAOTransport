const axios = require('axios');

var { DateTime } = require('luxon');

var AWS = require('aws-sdk');
AWS.config.update({region:'eu-west-1'});

/**
 * Send a response to CloudFormation regarding progress in creating resource.
 */
async function sendResponse(input, context, responseStatus, reason) {

	let responseUrl = input.ResponseURL;

	let output = new Object();
	output.Status = responseStatus;
	output.PhysicalResourceId = "StaticFiles";
	output.StackId = input.StackId;
	output.RequestId = input.RequestId;
	output.LogicalResourceId = input.LogicalResourceId;
	output.Reason = reason;
	await axios.put(responseUrl, output);
}

exports.initializer = async (input, context) => {
	
	console.log(JSON.stringify(input));
	
	let ims = getIMS();
	
	try {
		let requestType = input.RequestType;
		if (requestType == "Create") {
			let carrier = new Object();
			carrier.carrierName = "DAO";
		    let setup = new Object();
		    setup.customerId = '';
		    setup.code = '';
		    setup.senderId = '';
			let dataDocument = new Object();
			dataDocument.GLSTransport = setup;
			carrier.dataDocument = JSON.stringify(dataDocument);
			await ims.post("carriers", carrier);
		}
		await sendResponse(input, context, "SUCCESS", null);

	} catch (error) {
		await sendResponse(input, context, "SUCCESS", error);
	}

}

async function getIMS() {
	
    const authUrl = "https://auth.thetis-ims.com/oauth2/";
    const apiUrl = "https://api.thetis-ims.com/2/";

	var clientId = process.env.ClientId;   
	var clientSecret = process.env.ClientSecret; 
	var apiKey = process.env.ApiKey;  
	
    let data = clientId + ":" + clientSecret;
	let base64data = Buffer.from(data, 'UTF-8').toString('base64');	
	
	var imsAuth = axios.create({
			baseURL: authUrl,
			headers: { Authorization: "Basic " + base64data, 'Content-Type': "application/x-www-form-urlencoded" },
			responseType: 'json'
		});
    
    var response = await imsAuth.post("token", 'grant_type=client_credentials');
    var token = response.data.token_type + " " + response.data.access_token;
    
    var ims = axios.create({
    		baseURL: apiUrl,
    		headers: { "Authorization": token, "x-api-key": apiKey }
    	});
	
	ims.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
			}
	    	return Promise.reject(error);
		});

}

async function getDAO(ims, eventId) {
 
    const daoUrl = "https://api.gls.dk/ws/DK/V1/";
    
    var dao = axios.create({
		baseURL: daoUrl
	});
	
	dao.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
				var message = new Object
				message.time = Date.now();
				message.source = "DAOTransport";
				message.messageType = "ERROR";
				message.messageText = error.response.data.Message;
				ims.post("events/" + eventId + "/messages", message);
			}
	    	return Promise.reject(error);
		});

	return dao;
}

function lookupCarrier(carriers, carrierName) {
	let i = 0;
    let found = false;
    while (!found && i < carriers.length) {
    	let carrier = carriers[i];
    	if (carrier.carrierName == carrierName) {
    		found = true;
    	} else {
    		i++;
    	}	
    }
    
    if (!found) {
    	throw new Error('No carrier by the name ' + carrierName);
    }

	return carriers[i];
}

/**
 * A Lambda function that get shipping labels for parcels from GLS.
 */
exports.shippingLabelRequestHandler = async (event, context) => {
	
    console.info(JSON.stringify(event));

    var detail = event.detail;
    var shipmentId = detail.shipmentId;
    var contextId = detail.contextId;

	let ims = await getIMS();
	
	let dao = await getDAO(ims, detail.eventId);

    let response = await ims.get("carriers");
    var carriers = response.data;
    
    let carrier = lookupCarrier(carriers, 'GLS');
    var dataDocument = JSON.parse(carrier.dataDocument);
    var setup = dataDocument.DAOTransport;
    
    response = await ims.get("shipments/" + shipmentId);
    var shipment = response.data;
    
	var daoShipment = new Object();
	
	let i = 1;
	var parcels = [];
	var shippingContainers = [];
	shippingContainers = shipment.shippingContainers;
	shippingContainers.forEach(function(shippingContainer) {
    		var parcel = new Object();
    		
    		
    		
    		parcels.push(parcel);
    		i++;
    	});
	
	daoShipment.parcels = parcels;
	
	var senderAddress;
	var senderContactPerson;
    var sellerId = shipment.sellerId;
	if (sellerId != null) {
	    response = await ims.get("sellers/" + sellerId);
		senderAddress = response.data.address;
		senderContactPerson = response.data.contactPerson;
	} else {
		senderAddress = context.address;
		senderContactPerson = context.contactPerson;
	}
	
    response = await dao.post("CreateShipment", daoShipment);
    var glsResponse = response.data;
    
	var shippingLabel = new Object();
	shippingLabel.base64EncodedContent = glsResponse.PDF;
	shippingLabel.fileName = "SHIPPING_LABEL_" + shipmentId + ".pdf";
	await ims.post("shipments/"+ shipmentId + "/attachments", shippingLabel);

	await ims.put("shipments/" + shipmentId + "/consignmentId", glsResponse.consignmentId);
	
	var message = new Object
	message.time = Date.now();
	message.source = "GLSTransport";
	message.messageType = "INFO";
	message.messageText = "Labels are ready";
	await ims.post("events/" + detail.eventId + "/messages", message);

	return "done";

}
