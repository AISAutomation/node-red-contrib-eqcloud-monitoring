# node-red-contrib-eqcloud-monitoring
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![logo](images/ais_logo.jpg?raw=true)

This node is the easiest way to connect your equipment to the EquipmentCloud® of AIS Automation Dresden GmbH for any Monitoring purposes. 

![node](images/node.PNG?raw=true)

## Installation

`npm install node-red-contrib-eqcloud-monitoring`

## Usage

After installation you will find the node inside the Node-red palette. 

### Configuration

![node_properties](images/node_properties.PNG?raw=true)

**Name**
Give the node an individual name (e.g. EquipmentName)

**Authentication**
There are 2 different ways for adding the Authentication settings into the node.

The first one is "Custom": You have to login into your EquipmentCloud®, choose "Equipment Configuration" and "Equipment". In the list of available Equipments you will find the REST Service icon behind each equipment. Now choose your equipment and press the REST Service icon for all REST API details. Now you have to copy all values into the relevant input fields.

The second option is "File": You have to login into your EquipmentCloud®, choose "Equipment Configuration" and "Equipment". In the right top corner of the Equipment list, you will find "Download Rest Configuration". A JSON file will be downloaded. Now you can select the downloaded file at the parameter "Json config". After the upload you have to select the target Equipment from the Dropdown field at parameter "Equipment".

**Cycle Time**
This parameters sets the interval for sending values to the EquipmentCloud®. Incoming messages will be stored inside a buffer until the next interval. When the messages are send successfully to the EquipmentCloud® the buffer will be cleared.

**Max. Buffer Size**
You can set a maximum buffer size for storing the messages until the next cycle. If the maximum buffer is reached, older messages will be deleted and new messages will be stored.

When you have configured your Monitoring node correctly, the node will get a token and will show this as a green point under the node in your flow.

### Input 

The input for the Monitoring node must be a message format based on the REST API of the EquipmentCloud®. The following JSON message is an example for such a message. Please note that you have to be ensure that the correct type for each item (alarm, event, etc.) is selected.
```
{
    "items":[
        {
            "type":1,
            "id":"alarm1",
            "timestamp":"2019-01-11T08:19:56Z",
            "action":1
        },
        {
            "type":2,
            "id":"event1",
            "timestamp":"2019-01-11T06:38:29Z"
        },
        {
            "type":3, 
            "id":null,
            "timestamp":"2019-01-11T06:38:37Z",
            "count":1,
            "quality":1
        },
        {
            "type":4,
            "id":"numeric_process_value1",
            "timestamp":"2019-01-11T06:38:41Z",
            "value":-1.3555
        },
        {
            "type":4,
            "id":"string_process_value2",
            "timestamp":"2019-01-11T06:38:41Z",
            "value_string":"This is an example value"
        },
        {
            "type":4,
            "id":"boolean_process_value3",
            "timestamp":"2019-01-11T06:38:41Z",
            "value_boolean":true
        }
    ]
} 
```

If you want to have more information regarding our REST API please have a look into our [documentation](https://eqcloud.ais-automation.com/i/eqcloud/doc/Rest_API.pdf "documentation").

### Output

The node has two outputs. One for responses of the EquipmentCloud® and one for error messages.


## LICENSE

Licensed under the MIT License (MIT) License.