# Introduction

This application enables the printing of shipping labels from the carrier DAO as an integrated part of your packing process. 

# Installation

You may install the latest version of the application from the Serverless Application Repository. It is registered under the name thetis-ims-dao-transport.

## Parameters

When installing the application you must provide values for the following parameters:

- ContextId
- ThetisClientId
- ThetisClientSecret
- ApiKey
- DevOpsEmail

A short explanation for each of these parameters are provided upon installation.

## Initialization

Upon installation the application creates a carrier by the name 'DAO.

# Configuration

In the data document of the carrier by the name 'DAO':

```
{
  "DAOTransport": {
    "code": "y1eprmpowjjh",
    "test": true,
    "paper": "100x150",
    "senderId": "",
    "customerId": "1308"
  }
}
```
For your convenience the application is initially configured to use our test account. You may use this configuration as long as you keep the test attribute set to true.

To get your own customer id and code contact DAO.

The paper attribute may take one of the following values: 100x150, A4Foldable, 150x100, 100x150l, 100x150p. 

# Events

## Packing completed

Each shipping container is registered with DAO as a separate package. DAO does not know the concept of a shipment. To DAO each package is an independant entity of its own. 

The shipping container is updated with the tracking number assigned to the corresponding DAO package.

