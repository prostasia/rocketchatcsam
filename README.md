PhotoDNA CSEM scanning App
==========================

This RocketchatApp does validate uploaded images against the Microsoft PhotoDNA
cloud service https://www.microsoft.com/en-us/photodna 

Image validation happens befor the actual message is being shown. Images that match against the service are quarantined to a given room/channel for further treatment.

Configuration
=============

As Administrator go to Rocketchat settings / Apps and click on `Photo DNA CSEM-scanning`. This will open the app details page:

![App Details](doc/appDetails.png)

In `API Subscription Key` you have to enter your api key - the service will
not be active without the key.

In `CSEM Quarantine Target Channel` you have to provide the link to a channel where quarantined messages will move to. Please be sure to have this channel
created like shown in the following image

![targetChannel](doc/privateQuarantineChannel.png)

If the target channel does not exist, the image will be removed from the message.


Todos / Caveat
==============

* Currently the user posting the matching image does not see any actions happening, just the message not occuring.
* Automated Report Violation is not yet supported
* The images themselves are transported to the Microsoft Service. The Edge-Hash algorithm is not yet implemented.