import {
    IAppAccessors,
    ILogger,
    IConfigurationExtend,
    IEnvironmentRead,
    IRead,
    IHttp,
    IPersistence,
    IMessageBuilder,
    IConfigurationModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent, IPreMessageSentPrevent, IPreMessageSentModify } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { SettingType, ISetting } from '@rocket.chat/apps-engine/definition/settings';

import { PhotoDNACloudService } from './helper/PhotoDNACloudService';
import { IMatchResult } from './helper/IMatchResult';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms/IRoom';
import { SETTING_PHOTODNA_API_KEY, SETTING_QUARANTINE_CHANNEL, SETTING_LIMIT_ANALYSIS_TO_CHANNELS } from './Settings';

export class PhotoDnaCsemScanningApp extends App implements IPreMessageSentModify {

    private photoDnaService: PhotoDNACloudService;

    private quarantineChannel: string;
    private watchedRoomsId: Set<string> | undefined;

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
        this.photoDnaService = new PhotoDNACloudService();
    }

    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        await configuration.settings.provideSetting({
            id: SETTING_PHOTODNA_API_KEY,
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Api_Key_Label',
            i18nDescription: 'CSEM_Api_Key_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_QUARANTINE_CHANNEL,
            type: SettingType.STRING,
            packageValue: 'csem-quarantine',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Quarantine_Target_Channel_Label',
            i18nDescription: 'CSEM_Quarantine_Target_Channel_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_LIMIT_ANALYSIS_TO_CHANNELS,
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Limit_Analysis_To_Channels_Csv_Label',
            i18nDescription: 'CSEM_Limit_Analysis_To_Channels_Csv_Description',
        });
    }

    public async onEnable(environment: IEnvironmentRead, configurationModify: IConfigurationModify): Promise<boolean> {
        this.quarantineChannel = await environment.getSettings().getValueById(SETTING_QUARANTINE_CHANNEL);
        let limitRoomNamesCsv = await environment.getSettings().getValueById(SETTING_LIMIT_ANALYSIS_TO_CHANNELS)
        this.initLimitRoomNamesSet(limitRoomNamesCsv);
        return true;
    }

    public async onSettingUpdated(setting: ISetting, configurationModify: IConfigurationModify, read: IRead, http: IHttp): Promise<void> {
        if (SETTING_QUARANTINE_CHANNEL === setting.id) {
            this.quarantineChannel = setting.value;
        } else if (SETTING_LIMIT_ANALYSIS_TO_CHANNELS === setting.id) {
            await this.initLimitRoomNamesSet(setting.value);
        }
    }

    private async initLimitRoomNamesSet(limitRoomNamesCsv: string) {
        this.watchedRoomsId = undefined;
        if (limitRoomNamesCsv && limitRoomNamesCsv.length > 0) {
            this.watchedRoomsId = new Set<string>();
            let _csvRoomNames = limitRoomNamesCsv.trim();
            let _csvRoomsArray = _csvRoomNames.split(',');
            for (const roomName of _csvRoomsArray) {
                const room = await this.getAccessors().reader.getRoomReader().getByName(roomName.toLowerCase());
                if (room) {
                    this.getLogger().debug(`Watching room \'${roomName}\'`);
                    this.watchedRoomsId!.add(room.id);
                } else {
                    this.getLogger().warn(`Room not found for name \'${roomName}\'. Not adding to watch list.`);
                }
            }
        }
    }

    async checkPreMessageSentModify(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        if (this.watchedRoomsId && this.watchedRoomsId.size > 0) {
            if (!this.watchedRoomsId.has(message.room.id)) {
                return false;
            }
        }
        return this.photoDnaService.preMatchMessage(message, this.getLogger());
    }

    async executePreMessageSentModify(message: IMessage, builder: IMessageBuilder, read: IRead, http: IHttp, persistence: IPersistence): Promise<IMessage> {
        let result = await this.photoDnaService.matchMessage(message, this.getLogger(), read, http);
        if (result && result.IsMatch) {
             this.handleMatchingMessage(result, message, read, persistence, builder);
        } 
        return builder.getMessage();
    }

    private async handleMatchingMessage(result: IMatchResult, message: IMessage, read: IRead, persistence: IPersistence, builder: IMessageBuilder): Promise<void> {
        this.getLogger().warn('CSEM-MATCH', message.id, message.sender, result);

        if (this.quarantineChannel) {
            const targetRoom: IRoom | undefined = await read.getRoomReader().getByName(this.quarantineChannel);
            if (targetRoom) {
                // we have a target room - move it to this room
                // the original user uploading currently does not get notified
                builder.setRoom(targetRoom);
            } else {
                this.getLogger().warn('Defined target Room/Channel does not exist: ' + this.quarantineChannel);
                // we have no target room - at least remove the image
                builder.removeAttachment(0);
            }
        } else {
            this.getLogger().warn('No target channel for quarantined messages provided');
        }
    }

}
