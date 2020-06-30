import { IHttp, ILogger, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IImageData } from "./IImageData";
import { IMatchResult } from "./IMatchResult";
import { IMessage } from "@rocket.chat/apps-engine/definition/messages";
import { SETTING_PHOTODNA_API_KEY } from "../Settings";

/**
 * Validate a message against the Microsoft PhotoDNA cloud service
 * @see https://www.microsoft.com/en-us/photodna
 */
export class PhotoDNACloudService {

    private readonly Match_Post_Url = 'https://api.microsoftmoderator.com/photodna/v1.0/Match';

    /**
     * Determine whether matchMessage is to be executed, which is the case if this message
     * contains an image we can handle
     * @param message 
     * @param logger 
     */
    async preMatchMessage(message: IMessage, logger: ILogger): Promise<boolean> {
        // is there an attachment ?
        if (!message.attachments) {
            return false;;
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
        // determine image id and load it
        let imageId = imageAttachment.imageUrl.substring(0, imageAttachment.imageUrl.lastIndexOf('/')).replace('/file-upload/', '')
        // TODO better way to find image id?                
        let imageBuffer = await read.getUploadReader().getBufferById(imageId)
        if (!imageBuffer) {
            logger.warn('Could not load image buffer for image id ' + imageId);
            return undefined;
        }

        let result = await this.performMatchOperation(http, read, logger, {
            contentType: imageMimeType,
            data: imageBuffer
        });
        return result;

    }

    /**
     * Perform the match operation as defined by the PhotoDNA cloud service api
     * @param http 
     * @param read 
     * @param logger 
     * @param imageData 
     * @see https://developer.microsoftmoderator.com/docs/services/57c7426e2703740ec4c9f4c3/operations/57c7426f27037407c8cc69e6
     */
    private async performMatchOperation(http: IHttp, read: IRead, logger: ILogger, imageData: IImageData): Promise<IMatchResult | undefined> {
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
            // logger.debug('result', result.data)
            if (result.data) {
                return result.data as IMatchResult;
            }
        }
        return undefined;
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