import { IHttp, ILogger, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IImageData } from "./IImageData";
import { IMatchResult } from "./IMatchResult";
import { IMessage } from "@rocket.chat/apps-engine/definition/messages";
import { SETTING_PHOTODNA_API_KEY, SETTING_NCMEC_USER, SETTING_NCMEC_PASSWORD, SETTING_NCMEC_ORGNAME, SETTING_NCMEC_REPORTER_NAME, SETTING_NCMEC_REPORTER_EMAIL, SETTING_NCMEC_ENABLE_TEST_MODE } from "../Settings";

/**
 * Microsoft PhotoDNA cloud service
 * @see https://www.microsoft.com/en-us/photodna
 */
export class PhotoDNACloudService {

    private readonly Match_Post_Url = 'https://api.microsoftmoderator.com/photodna/v1.0/Match';
    private readonly Report_Post_Url = 'https://api.microsoftmoderator.com/photodna/v1.0/Report';

    /**
     * Determine whether matchMessage is to be executed, which is the case if this message
     * contains an image we can handle
     * @param message
     * @param logger
     */
    async preMatchMessage(message: IMessage, logger: ILogger): Promise<boolean> {
        // is there an attachment ?
        if (!message.attachments) {
            return false;
        }
        // is it an image ?
        if (!message.attachments[0].imageUrl) {
            return false;
        }

        var imageAttachment: any = message.attachments[0];
        let imageMimeType = imageAttachment.imageType;
        // does the PhotoDNA service support this attachment ?
        if (!this.isSupportedImageMimeType(imageMimeType)) {
            logger.warn('Could not perform match operation on unsupported image type ' + imageMimeType);
            return false;
        }
        return true;
    }

    /**
     * Matches the message against the PhotoDNA service. Before executing this method, be sure to call preMatchMessage
     * @param message
     * @param logger
     * @param read
     * @param http
     */
    async matchMessage(message: IMessage, logger: ILogger, read: IRead, http: IHttp): Promise<IMatchResult | undefined> {
        var imageAttachment: any = message.attachments![0];
        let imageMimeType = imageAttachment.imageType;
        let imageFileName = imageAttachment.title.value;
        // determine image id and load it
        let imageId = imageAttachment.imageUrl.substring(0, imageAttachment.imageUrl.lastIndexOf('/')).replace('/file-upload/', '')
        // TODO better way to find image id?
        let imageBuffer = await read.getUploadReader().getBufferById(imageId)
        if (!imageBuffer) {
            logger.warn('Could not load image buffer for image id ' + imageId);
            return undefined;
        }

        let result = await this.performMatchOperation(http, read, {
            contentType: imageMimeType,
            filename: imageFileName,
            data: imageBuffer
        });
        return result;
    }

    /**
     * Perform the match operation as defined by the PhotoDNA cloud service api
     * @param http
     * @param read
     * @param imageData
     * @see https://developer.microsoftmoderator.com/docs/services/57c7426e2703740ec4c9f4c3/operations/57c7426f27037407c8cc69e6
     */
    private async performMatchOperation(http: IHttp, read: IRead, imageData: IImageData): Promise<IMatchResult | undefined> {
        const apiKey = await read.getEnvironmentReader().getSettings().getValueById(SETTING_PHOTODNA_API_KEY);
        if (apiKey) {
            let content = JSON.stringify({
                "DataRepresentation": "inline",
                "Value": imageData.data.toString('base64')
            })

            let result = await http.post(this.Match_Post_Url, {
                content,
                params: {
                    'enhance': 'false'
                },
                headers: {
                    'Ocp-Apim-Subscription-Key': apiKey
                }
            })
            if (result.data) {
                let matchResult = result.data as IMatchResult;
                matchResult.ImageData = imageData;
                return matchResult;
            }
        }
        return undefined;
    }

    /**
     * Report a content violation to NCMEC
     * @param matchResult
     * @param http
     * @param message
     * @param read
     * @see https://developer.microsoftmoderator.com/docs/services/57c7426e2703740ec4c9f4c3/operations/57c77fdee3a97812ecf8bdeb
     */
    public async performReportOperation(matchResult: IMatchResult, http: IHttp, message: IMessage, read: IRead): Promise<any> {
        const apiKey = await read.getEnvironmentReader().getSettings().getValueById(SETTING_PHOTODNA_API_KEY);
        const ncmecUser = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_USER);
        const ncmecPassword = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_PASSWORD);
        const ncmecOrgName = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_ORGNAME);
        const ncmecReporterName = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_REPORTER_NAME);
        const ncmecReporterEmail = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_REPORTER_EMAIL);
        const enableTestMode = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_ENABLE_TEST_MODE);
        if (apiKey && ncmecUser && ncmecPassword) {
            let content = JSON.stringify({
                "OrgName": ncmecOrgName,
                "ReporterName": ncmecReporterName,
                "ReporterEmail": ncmecReporterEmail,
                "IncidentTime": (message.createdAt) ? message.createdAt.toISOString() : "",
                "ReporteeName": message.sender.username,
                "ReporteeIPAddress": "127.0.0.1",
                "ViolationContentCollection": [
                    {
                        "Name": (matchResult.ImageData) ? matchResult.ImageData.filename : "noFileName",
                        "Value": (matchResult.ImageData) ? matchResult.ImageData.data.toString('base64') : "noImageData"
                    }
                ],
                "AdditionalMetadata": [
                    {
                        "Key": "IsTest", "Value": "true"
                    }
                ]
            });
            if (!enableTestMode) {
                delete content["AdditionalMetadata"];
            }
            let result = await http.post(this.Report_Post_Url, {
                content,
                headers: {
                    'Ocp-Apim-Subscription-Key': apiKey,
                    'x-usr': ncmecUser,
                    'x-pwd': ncmecPassword
                }
            });
            return result;
        }
    }

    isSupportedImageMimeType(mimeType: string): Boolean {
        switch (mimeType) {
            case ('image/gif'):
            case ('image/jpeg'):
            case ('image/png'):
            case ('image/bmp'):
            case ('image/tiff'):
                return true;
        }
        return false;
    }
}
