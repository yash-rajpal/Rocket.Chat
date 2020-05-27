import _ from 'lodash';

import { IEDataRoom } from '../../../events/definitions/data/IEDataRoom';
import { IEDataMessage } from '../../../events/definitions/data/IEDataMessage';
import { EventContext, EventTypeDescriptor, EDataDefinition, IEData, IEvent } from '../../../events/definitions/IEvent';
import { IRoom } from '../../../events/definitions/IRoom';
import { getLocalSrc } from '../../../events/server/lib/getLocalSrc';
import { IAddEventResult, IContextQuery, EventsModel, IEventStub } from './Events';
import { IEDataUpdate } from '../../../events/definitions/data/IEDataUpdate';
import { IEDataEmpty } from '../../../events/definitions/data/IDataEmpty';

const getContextQuery = (param: string | IEvent<any>): IContextQuery => {
	let cid: string;

	if (typeof param === 'string') {
		cid = param;
	} else {
		cid = param.cid;
	}

	return { ct: EventContext.ROOM, cid };
};

class RoomEventsModel extends EventsModel {
	readonly v1ToV2RootMap = ['_cid' /* this is the old _id, now it is called "client id" because it is generated by the client */, '_pids', 'v', 'ts', 'src', 'cid', 't', 'd', '_updatedAt', '_deletedAt'];

	constructor() {
		super('room_event');

		this.tryEnsureIndex({ 'd.u._id': 1 }, { sparse: true });
		this.tryEnsureIndex({ cid: 1, t: 1, 'd.u._id': 1 }, { sparse: true });
		this.tryEnsureIndex({ 'd.expireAt': 1 }, { expireAfterSeconds: 0 });
		this.tryEnsureIndex({ 'd.msg': 'text' }, { sparse: true });
		this.tryEnsureIndex({ 'd.file._id': 1 }, { sparse: true });
		this.tryEnsureIndex({ 'd.mentions.username': 1 }, { sparse: true });
		this.tryEnsureIndex({ 'd.pinned': 1 }, { sparse: true });
		this.tryEnsureIndex({ 'd.snippeted': 1 }, { sparse: true });
		this.tryEnsureIndex({ 'd.location': '2dsphere' });
		this.tryEnsureIndex({ 'd.unread': 1 }, { sparse: true });

		// slack bridge
		this.tryEnsureIndex({ 'd.slackBotId': 1, 'd.slackTs': 1 }, { sparse: true });

		// discussions
		this.tryEnsureIndex({ 'd.drid': 1 }, { sparse: true });
		// threads
		this.tryEnsureIndex({ 'd.tmid': 1 }, { sparse: true });
		this.tryEnsureIndex({ 'd.tcount': 1, tlm: 1 }, { sparse: true });
		// livechat
		this.tryEnsureIndex({ 'd.navigation.token': 1 }, { sparse: true });
	}

	public ensureSrc(src: string) {
		return src || getLocalSrc();
	}

	public async addRoomEvent<T extends EDataDefinition>(event: IEvent<T>): Promise<IAddEventResult> {
		return super.addEvent(getContextQuery(event), event);
	}

	public async updateRoomEventData<T extends EDataDefinition>(event: IEvent<T>, dataToUpdate: IEDataUpdate<IEData>): Promise<void> {
		return super.updateEventData(getContextQuery(event), event.t, dataToUpdate, event._cid);
	}

	public async flagRoomEventAsDeleted<T extends EDataDefinition>(event: IEvent<T>): Promise<void> {
		return super.flagEventAsDeleted(getContextQuery(event), event.t, new Date(), event._cid);
	}

	public async createRoomGenesisEvent(src: string, room: IRoom): Promise<IEvent<IEDataRoom>> {
		src = this.ensureSrc(src);

		const event: IEDataRoom = { room };

		return super.createGenesisEvent(src, getContextQuery(room._id), event);
	}

	public async createMessageEvent<T extends IEDataMessage>(src: string, roomId: string, _cid: string, d: T): Promise<IEvent<T>> {
		src = this.ensureSrc(src);

		const stub: IEventStub<T> = {
			_cid,
			t: EventTypeDescriptor.MESSAGE,
			d,
		};

		return super.createEvent(src, getContextQuery(roomId), stub);
	}

	public async createEditMessageEvent<T extends IEDataUpdate<IEDataMessage>>(src: string, roomId: string, _cid: string, d: T): Promise<IEvent<T>> {
		src = this.ensureSrc(src);

		const stub: IEventStub<T> = {
			_cid,
			t: EventTypeDescriptor.EDIT_MESSAGE,
			d,
		};

		return super.createEvent(src, getContextQuery(roomId), stub);
	}

	public async createDeleteMessageEvent(src: string, roomId: string, _cid?: string): Promise<IEvent<IEDataUpdate<IEDataEmpty>>> {
		src = this.ensureSrc(src);

		const stub: IEventStub<IEDataUpdate<IEDataEmpty>> = {
			_cid,
			t: EventTypeDescriptor.DELETE_MESSAGE,
			d: {},
		};

		return super.createEvent(src, getContextQuery(roomId), stub);
	}

	public async createDeleteRoomEvent(src: string, roomId: string): Promise<IEvent<IEDataUpdate<IEDataEmpty>>> {
		src = this.ensureSrc(src);

		const stub: IEventStub<IEDataUpdate<IEDataEmpty>> = {
			t: EventTypeDescriptor.DELETE_ROOM,
			d: {},
		};

		return super.createEvent(src, getContextQuery(roomId), stub);
	}

	public async createPruneMessagesEvent(options: any): Promise<{ count: number }> {
		const { result }: any = await this.model.rawCollection().updateMany({
			'd.msg': { $exists: 1 },
			'd.drid': { $exists: 0 },
			...options,
		}, {
			$set: {
				'd.msg': '', // TODO: this is removing the other fields as well, check how to change only msg
			},
			$currentDate: { _deletedAt: true },
		});

		console.log('createPruneMessagesEvent eventMessages', result);

		// console.log('createPruneMessagesEvent result nModified', typeof result.nModified, result.nModified);

		return {
			count: result.nModified,
		};
	}

	// async createAddUserEvent(src, roomId, user, subscription, domainsAfterAdd) {
	// 	return super.createEvent(src, getContextQuery(roomId), eventTypes.ROOM_ADD_USER, { roomId, user, subscription, domainsAfterAdd });
	// }

	// async createRemoveUserEvent(src, roomId, user, domainsAfterRemoval) {
	// 	return super.createEvent(src, getContextQuery(roomId), eventTypes.ROOM_REMOVE_USER, { roomId, user, domainsAfterRemoval });
	// }

	// async createDeleteMessageEvent(src, roomId, messageId) {
	// 	return super.createEvent(src, getContextQuery(roomId), eventTypes.ROOM_DELETE_MESSAGE, { roomId, messageId });
	// }

	// async createSetMessageReactionEvent(src, roomId, messageId, username, reaction) {
	// 	return super.createEvent(src, getContextQuery(roomId), eventTypes.ROOM_SET_MESSAGE_REACTION, { roomId, messageId, username, reaction });
	// }

	// async createUnsetMessageReactionEvent(src, roomId, messageId, username, reaction) {
	// 	return super.createEvent(src, getContextQuery(roomId), eventTypes.ROOM_UNSET_MESSAGE_REACTION, { roomId, messageId, username, reaction });
	// }

	// async createMuteUserEvent(src, roomId, user) {
	// 	return super.createEvent(src, getContextQuery(roomId), eventTypes.ROOM_MUTE_USER, { roomId, user });
	// }

	// async createUnmuteUserEvent(src, roomId, user) {
	// 	return super.createEvent(src, getContextQuery(roomId), eventTypes.ROOM_UNMUTE_USER, { roomId, user });
	// }

	// async removeRoomEvents(roomId) {
	// 	return super.removeContextEvents(getContextQuery(roomId));
	// }

	//
	// Backwards compatibility
	//
	public belongsToV2Root(property: string): boolean {
		return this.v1ToV2RootMap.indexOf(property) !== -1;
	}

	public fromV1Data(message: IEDataMessage): IEDataMessage {
		return { ..._.omit(message, this.v1ToV2RootMap), t: message.t || 'msg', u: message.u, msg: message.msg };
	}

	public toV1(event: any) {
		return {
			..._.omit(event, '_pids', '_cid', 'v', 'dHash', 'src', 'ct', 'cid', 'd'),
			...event.d,
			t: (event.d || {}).t,
			rid: event.cid,
		};
	}
}

export const RoomEvents = new RoomEventsModel();
