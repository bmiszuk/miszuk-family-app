import {deliverPush} from '../../src/api/notifications/transport.js';
export default {async fetch(request){const {subscription,vapid,payload}=await request.json();return Response.json(await deliverPush(subscription,vapid,payload));}};
