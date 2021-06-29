# node-red-contrib-eqcloud-monitoring
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![logo](images/eqcloud.png?raw=true)](https://equipmentcloud.de/)

This [node](https://flows.nodered.org/node/@ais_automation/node-red-contrib-eqcloud-monitoring) is the easiest way to connect your equipment to the [EquipmentCloud®](https://equipmentcloud.de/) of Kontron AIS GmbH for any Monitoring purposes. 

[![node](images/node.PNG?raw=true)](https://flows.nodered.org/node/@ais_automation/node-red-contrib-eqcloud-monitoring)

## Installation

`npm install @ais_automation/node-red-contrib-eqcloud-monitoring`

## Usage

After installation you will find the node inside the Node-red palette. 

### Configuration

![node_properties](images/node_properties.PNG?raw=true)

**Name**:
Give the node an individual name (e.g. EquipmentName)

**Authentication**:
There are 2 different ways for adding the Authentication settings into the node.

The first one is "Custom": You have to login into your EquipmentCloud®, choose "Equipment Configuration" and "Equipment". In the list of available Equipments you will find the REST Service icon behind each equipment. Now choose your equipment and press the REST Service icon for all REST API details. Now you have to copy all values into the relevant input fields.

The second option is "File": You have to login into your EquipmentCloud®, choose "Equipment Configuration" and "Equipment". In the right top corner of the Equipment list, you will find "Download Rest Configuration". A JSON file will be downloaded. Now you can select the downloaded file at the parameter "Json config". After the upload you have to select the target Equipment from the Dropdown field at parameter "Equipment".

**Cycle Time**:
This parameters sets the interval for sending values to the EquipmentCloud®. Incoming messages will be stored inside a buffer until the next interval. When the messages are send successfully to the EquipmentCloud® the buffer will be cleared.

**Sending Delay**:
The monitoring node automatically sorts all buffered messages in the chronologically correct order before sending them to EquipmentCloud®. This is done using the *timestamp* attribute in the message. If your process has data or events that are not available until a later point in time, you can also delay the sending of messages. In this case, only messages older than the specified delay time are taken from the buffer during each send cycle.

**Item Priority**:
This parameter sets the sort order of messages with the same *timestamp* attribute. This way you can distinguish whether a state change occurred before or after an alarm or a part was produced. The order of events can affects the presentation of data and calculation of KPI values in the EqupmentCloud®. The following options are available for this purpose:
- **First In First Out**: The order in which the messages were passed to the node is preserved. 
- **Events First**: Events for equipment state change are sent to EquipmentCloud® first. All following alarms and produced parts therefore get the property of the last passed state of the equipment.
- **Events Last**: Events for equipment state change are sent to EquipmentCloud® after the other messages. All alarms and produced parts up to the state change message therefore get the property of the previous equipment state.

**Max. Buffer Size**:
You can set a maximum buffer size for storing the messages until the next cycle. If the maximum buffer is reached, older messages will be deleted and new messages will be stored. 

When you have configured your Monitoring node correctly, the node will get a token and will show this as a green point under the node in your flow.

### Monitoring Data 

The input for the Monitoring node must be a message format based on the REST API of the EquipmentCloud®. The following JSON message is an example for such a message. Please note that you have to be ensure that the correct type for each item (alarm, event, etc.) is selected.
```
{
    "items": [
        {
            "type": 1,
            "id": "alarm1",
            "timestamp": "2019-01-11T08:19:56Z",
            "action": 1,
            "additional_values": [
                "low speed",
                1,
                "5 m/h"
            ]
        },
        {
            "type": 2,
            "id": "event1",
            "timestamp": "2019-01-11T06:38:29Z"
        },
        {
            "type": 3,
            "id": null,
            "timestamp": "2019-01-11T06:38:37Z",
            "count": 1,
            "quality": 1
        },
        {
            "type": 4,
            "id": "numeric_process_value1",
            "timestamp": "2019-01-11T06:38:41Z",
            "value": -1.3555
        },
        {
            "type": 4,
            "id": "string_process_value2",
            "timestamp": "2019-01-11T06:38:41Z",
            "value_string": "This is an example value"
        },
        {
            "type": 4,
            "id": "boolean_process_value3",
            "timestamp": "2019-01-11T06:38:41Z",
            "value_boolean": true
        }
    ]
}
```
### Equipment Configuration

You can also dynamically upload the type configuration of the equipment. This allows, e.g., to create an alarm in the EquipmentCloud®, which has not been configured yet. Note that this may affect other equipment of the same type.
```
{
    "states": [
        {
        "name": "Running"
        },
        {
        "name": "Stopped"
        }
    ],
    "events": [
        {
        "id": "start",
        "name": "Start button pressed"
        },
        {
        "id": "stop",
        "name": "Stop button pressed"
        }
    ],
    "statemodels": [
        {
        "event": {
            "id": "start"
        },
        "state": {
            "name": "Running"
        },
        "standardState": {
            "id": "prd"
        }
        },
        {
        "event": {
            "id": "stop"
        },
        "state": {
            "name": "Stopped"
        },
        "standardState": {
            "id": "sdt"
        }
        }
    ],
    "alarmclasses": [
        {
        "name": "High Priority",
        "color": "#FF0000"
        },
        {
        "name": "Low Priority",
        "color": "#C7BF20"
        }
    ],
    "alarms": [
        {
        "id": "dooropen",
        "text": "Door still open",
        "type": "Error",
        "class": {
            "name": "High Priority"
        }
        },
        {
        "id": "empty",
        "text": "Mashine is still empty",
        "type": "Warning",
        "class": {
            "name": "Low Priority"
        }
        }
    ],
    "processvalues": [
        {
        "id": "rpm",
        "name": "RPM",
        "type": "double",
        "unit": "U/min",
        "color": "#45C78D"
        },
        {
        "id": "temperature",
        "name": "Temperature",
        "type": "double",
        "unit": "°C",
        "color": "#F21352"
        }
    ],
    "oeeparameters": [
        {
        "product": "Colourful Clothes",
        "unitsPerHour": 90,
        "productionFactor": 1
        },
        {
        "product": null,
        "unitsPerHour": 50,
        "productionFactor": 1
        }
    ]
}
```
If you want to have more information regarding our REST API, please log in to your account and take a look at:

**Help Center / Help & Tips / RESTful Service API Explorer / Monitoring API 2.0**

### Output

The node has two outputs. One for responses of the EquipmentCloud® and one for error messages.


## LICENSE

Licensed under the MIT License (MIT).