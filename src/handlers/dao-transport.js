/**
 * Copyright 2021 Thetis Apps Aps
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * 
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * 
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const axios = require('axios');

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
	
	console.log(JSON.stringify(output));
	
	await axios.put(responseUrl, output);
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
    		headers: { "Authorization": token, "x-api-key": apiKey, "Content-Type": "application/json" }
    	});
	
	ims.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			console.log(JSON.stringify(error));
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
			}
	    	return Promise.reject(error);
		});

	return ims;
}

async function getDAO() { 
 
	let daoUrl = "https://api.dao.as/";
    
    var dao = axios.create({
		baseURL: daoUrl,
		timeout: 15000
	});
	
	dao.interceptors.response.use(function(response) {
			if (response.headers['content-type'] == "application/json") {
				console.log("SUCCESS " + JSON.stringify(response.data));
			} else {
				console.log("SUCCESS " + response.headers['content-type']);
			}
 	    	return response;
		}, function (error) {
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response));
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

exports.initializer = async (input, context) => {
	
	console.log(JSON.stringify(input));
	
	try {
		let ims = await getIMS();
		let requestType = input.RequestType;
		if (requestType == "Create") {
			let carrier = new Object();
			carrier.carrierName = "DAO";
		    let setup = new Object();
		    setup.customerId = '1308';
		    setup.code = 'y1eprmpowjjh';
		    setup.senderId = '';
			let dataDocument = new Object();
			dataDocument.DAOTransport = setup;
			carrier.dataDocument = JSON.stringify(dataDocument);
			await ims.post("carriers", carrier);
		}
		await sendResponse(input, context, "SUCCESS", "OK");

	} catch (error) {
		await sendResponse(input, context, "SUCCESS", JSON.stringify(error));
	}

};

async function book(ims, detail) {
	
	    var shipmentId = detail.shipmentId;

	let dao = await getDAO(ims, detail.eventId);

    let response = await ims.get("carriers");
    var carriers = response.data;
    
    let carrier = lookupCarrier(carriers, 'DAO');
    var dataDocument = JSON.parse(carrier.dataDocument);
    var setup = dataDocument.DAOTransport;
    
    response = await ims.get("shipments/" + shipmentId);
    var shipment = response.data;
    
    let labels = [];
	var shippingContainers = [];
	let countryCode = shipment.deliveryAddress.countryCode;
	shippingContainers = shipment.shippingContainers;
	for (let i = 0; i < shippingContainers.length; i++) {
		
		let shippingContainer = shippingContainers[i];

		let params = new Object();

		let uri;
		if (countryCode != 'DK') {
			uri = "DAODirekte/UdlandLeveringsOrdre.php";
		} else if (shipment.deliverToPickUpPoint) {
			uri = "DAOPakkeshop/leveringsordre.php";
		} else {
			uri = "DAODirekte/leveringsordre.php";
		}
		
		console.log("Calling DAO at " + uri);

		let deliveryAddress = shipment.deliveryAddress;
		let contactPerson = shipment.contactPerson;
		params.kundeid = setup.customerId;
		params.kode = setup.code;
		params.afsenderid = setup.senderId;
		if (shipment.deliverToPickUpPoint) {
			params.shopid = shipment.pickUpPointId;
		}
		params.postnr = deliveryAddress.postalCode;
		params.adresse = deliveryAddress.streetNameAndNumber;
		params.navn = deliveryAddress.addressee;
		if (contactPerson != null) {
			params.mobil = contactPerson.mobileNumber;
			params.email = contactPerson.email;
		}
		let grossWeight = shippingContainer.grossWeight;
		if (grossWeight != null) {
			params.vaegt = grossWeight * 1000;
		}
		let dimensions = shippingContainer.dimensions;
		if (dimensions != null) {
			params.l = dimensions.length * 100;
			params.h = dimensions.height * 100;
			params.b = dimensions.width * 100;
		}
		params.idkrav = "Udleveringskode";
		params.faktura = shipment.shipmentNumber;
		params.afsenderid = setup.senderId;
		params.test = setup.test ? 1 : 0;
		params.format = "JSON";
		
		if (deliveryAddress.countryCode != 'DK') {
			params.by = deliveryAddress.cityTownOrVillage;
			params.land = countryCode;
			params.reference = shipment.shipmentNumber;
		}

		console.log(JSON.stringify(params));

		response = await dao.get(uri, { params: params });
		if (response.data.status == "OK") {
			
			let trackingNumber = response.data.resultat.stregkode;
	
			response = await ims.patch("shippingContainers/" + shippingContainer.id,  { trackingNumber: trackingNumber });
			shippingContainer = response.data;
			
			await ims.patch("shipments/" + shipmentId, { carriersShipmentNumber: trackingNumber });

			params = new Object();
			params.kundeid = setup.customerId;
			params.kode = setup.code;
			params.stregkode = trackingNumber;
			params.papir = setup.paper;
			params.format = "JSON";
			response = await dao.get("HentLabel.php", { params: params, responseType: 'arraybuffer' });
			
			if (response.headers['content-type'] == "application/pdf") {
			
				let shippingLabel = new Object();
				shippingLabel.base64EncodedContent = response.data.toString('base64');
				shippingLabel.fileName = "SHIPPING_LABEL_" + shippingContainer.id + ".pdf";
				labels.push(shippingLabel);
	
			} else {
				
				let message = new Object();
				message.time = Date.now();
				message.source = "DAOTransport";
				message.deviceName = detail.deviceName;
				message.userId = detail.userId;
				message.messageType = "ERROR";
				message.messageText = "Failed to get labels from DAO. DAO says: " + response.data.fejltekst;
				await ims.post("events/" + detail.eventId + "/messages", message);

			}	
			
		} else {
			
			let message = new Object();
			message.time = Date.now();
			message.source = "DAOTransport";
			message.deviceName = detail.deviceName;
			message.userId = detail.userId;
			message.messageType = "ERROR";
			message.messageText = "Failed to register shipping container with DAO. DAO says: " + response.data.fejltekst;
			await ims.post("events/" + detail.eventId + "/messages", message);
			
		}
	}

	return labels;
}

exports.bookingHandler = async (event, context) => {

    console.info(JSON.stringify(event));

    var detail = event.detail;

	let ims = await getIMS();

	await ims.patch('/documents/' + detail.documentId, { workStatus: 'ON_GOING' });
	
    let labels = await book(ims, detail);
    
	if (labels.length > 0) {
		for (let label of labels) {
			await ims.post('/documents/' + detail.documentId + '/attachments', label);
		}
		await ims.patch('/documents/' + detail.documentId, { workStatus: 'DONE' });
    } else {
		await ims.patch('/documents/' + detail.documentId, { workStatus: 'FAILED' });
    }
    
	return "done";
	
};
