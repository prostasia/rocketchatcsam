import {
    IAppAccessors,
    ILogger,
    IConfigurationExtend,
    IEnvironmentRead,
    IRead,
    IHttp,
    IPersistence,
    IMessageBuilder,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent, IPreMessageSentPrevent, IPreMessageSentModify } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';

import { PhotoDNACloudService } from './helper/PhotoDNACloudService';
import { IMatchResult } from './helper/IMatchResult';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms/IRoom';

export class PhotoDnaCsemScanningApp extends App implements IPreMessageSentModify {
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
            packageValue: 'csem-quarantine',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Quarantine_Target_Channel_Label',
            i18nDescription: 'CSEM_Quarantine_Target_Channel_Description',
        });
    }

    async checkPreMessageSentModify(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        return this.photoDnaService.preMatchMessage(message, this.getLogger());
    }

    async executePreMessageSentModify(message: IMessage, builder: IMessageBuilder, read: IRead, http: IHttp, persistence: IPersistence): Promise<IMessage> {
        let result = await this.photoDnaService.matchMessage(message, this.getLogger(), read, http);
        if (result && result.IsMatch) {
            return this.handleMatchingMessage(result, message, read, persistence, builder);
        } else {
            return message;
        }
    }

    private async handleMatchingMessage(result: IMatchResult, message: IMessage, read: IRead, persistence: IPersistence, builder: IMessageBuilder): Promise<IMessage> {
        this.getLogger().warn('CSEM-MATCH', message.id, message.sender, result);

        let targetChannel = await read.getEnvironmentReader().getSettings().getValueById('csem-quarantine-target-channel');
        if (targetChannel) {
            const targetRoom: IRoom | undefined = await read.getRoomReader().getByName(targetChannel);
            if (targetRoom) {
                // we have a target room - move it to this room
                // the original user uploading currently does not get notified
                builder.setRoom(targetRoom);
            } else {
                this.getLogger().warn('Defined target Room/Channel does not exist: ' + targetChannel);
                // we have no target room - at least remove the image
                builder.removeAttachment(0);
            }
        } else {
            this.getLogger().warn('No target channel for quarantined messages provided');
        }
        return message;
    }

}
