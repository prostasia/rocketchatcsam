import {
    IAppAccessors,
    ILogger,
    IConfigurationExtend,
    IEnvironmentRead,
    IRead,
    IHttp,
    IPersistence,
    IModify,
    IMessageBuilder,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent, IPreMessageSentPrevent } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';

import { PhotoDNACloudService } from './helper/PhotoDNACloudService';

export class PhotoDnaCsemScanningApp extends App implements IPostMessageSent, IPreMessageSentPrevent {
    private photoDnaService: PhotoDNACloudService;

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);

        this.photoDnaService = new PhotoDNACloudService();
    }

    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        await configuration.settings.provideSetting({
            id: 'csem-api-key',
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Api_Key_Label',
            i18nDescription: 'CSEM_Api_Key_Description',
        });
        await configuration.settings.provideSetting({
            id: 'csem-quarantine-target-channel',
            type: SettingType.STRING,
            packageValue: '#csem-quarantine',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Quarantine_Target_Channel_Label',
            i18nDescription: 'CSEM_Quarantine_Target_Channel_Description',
        });
        await configuration.settings.provideSetting({
            id: 'csem-perform-asynchronous-validation',
            type: SettingType.BOOLEAN,
            packageValue: true,
            required: false,
            public: false,
            i18nLabel: 'CSEM_Perform_Asynchronous_Validation_Label',
            i18nDescription: 'CSEM_Perform_Asynchronous_Validation_Description'
        });
    }

    async executePreMessageSentPrevent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence): Promise<boolean> {
        const performAsynchronousValidation = await read.getEnvironmentReader().getSettings().getValueById('csem-perform-asynchronous-validation');
        if (performAsynchronousValidation) {
            return false;
        }

        let result = await this.photoDnaService.matchMessage(message, this.getLogger(), read, http);
        if (result && result.IsMatch) {
            // we have a match - prevent image from being posted
            return true;
        }

        return false;
    }

    async executePostMessageSent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void> {
        const performAsynchronousValidation = await read.getEnvironmentReader().getSettings().getValueById('csem-perform-asynchronous-validation');
        if (!performAsynchronousValidation) {
            return;
        }

        let result = await this.photoDnaService.matchMessage(message, this.getLogger(), read, http);
        if (result && result.IsMatch) {
            // this.getLogger().warn('CSEM-MATCH', result);
            let user = await read.getUserReader().getAppUser(this.getID());
            this.getLogger().warn('user', message.sender);

            const new_message: IMessage = {
                room: message.room,
                sender: user,
                text: `CSEM-MATCH:` + result.IsMatch,
            } as IMessage;
            modify.getNotifier().notifyUser(message.sender, new_message);
        }

        // // handle it

        // if (message.attachments && message.attachments[0].imageUrl) {
        //     //this.getLogger().log('attachment', message.attachments)

        //     var imageAttachment: any = message.attachments[0];
        //     let imageMimeType = imageAttachment.imageType;
        //     if (this.photoDnaService.isSupportedImageMimeType(imageMimeType)) {
        //         let imageId = imageAttachment.imageUrl.substring(0, imageAttachment.imageUrl.lastIndexOf('/')).replace('/file-upload/', '')
        //         // TODO better way to find image id?                
        //         let imageBuffer = await read.getUploadReader().getBufferById(imageId)
        //         if (imageBuffer) {
        //             let result = await this.photoDnaService.performMatchOperation(http, read, this.getLogger(), {
        //                 contentType: imageMimeType,
        //                 data: imageBuffer
        //             });

        //             if (result && result.IsMatch) {
        //                 // this.getLogger().warn('CSEM-MATCH', result);
        //                 let user = await read.getUserReader().getAppUser(this.getID());
        //                 this.getLogger().warn('user', message.sender);

        //                 const new_message: IMessage = {
        //                     room: message.room,
        //                     sender: user,
        //                     text: `CSEM-MATCH:` + result.IsMatch,
        //                 } as IMessage;
        //                 modify.getNotifier().notifyUser(message.sender, new_message);
        //             }

        //         } else {
        //             throw new Error("Could not load image buffer for imageId " + imageId);
        //         }

        //     } else {
        //         // TODO
        //         throw new Error("Unsupported image type " + imageMimeType);
        //     }
        // }
    }



}
