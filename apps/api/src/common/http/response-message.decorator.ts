import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response:message';

/** Sets the `message` of the success envelope for a route (default: "Success"). */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE_KEY, message);
