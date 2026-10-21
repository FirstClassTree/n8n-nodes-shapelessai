import {
	NodeApiError,
	NodeOperationError,
	NodeConnectionTypes,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type IHttpRequestMethods,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

const BASE = 'https://shapelessai.com';

type Connection = { id: string; platform: string; handle: string; displayName?: string | null; mode: string; status: string };

async function api(
	ctx: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	url: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	try {
		return (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'shapelessAIApi', {
			method, url: `${BASE}${url}`, body, qs, json: true,
		})) as IDataObject;
	} catch (error) {
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

// Only accounts a post can go to: tracked (read-only) accounts are left out.
const postable = (c: Connection) => c.mode === 'oauth' && c.status === 'active';

export class ShapelessAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ShapelessAI',
		name: 'shapelessAi',
		icon: 'file:shapelessai.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Schedule and publish social media posts with ShapelessAI',
		defaults: { name: 'ShapelessAI' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'shapelessAIApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Post', value: 'post' },
				],
				default: 'post',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [{ name: 'Get Many', value: 'getAll', action: 'Get many connected accounts', description: 'List the social accounts a post can go to' }],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['post'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a post', description: 'Schedule a post to the next queue slot, at a time, or now' },
					{ name: 'Delete', value: 'delete', action: 'Cancel a scheduled post', description: 'Cancel a post that has not been published' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many posts', description: 'Recent posts with status, time and live URL' },
				],
				default: 'create',
			},
			{
				displayName: 'Account Name or ID',
				name: 'connectionId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAccounts' },
				required: true,
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				description: 'The post text, exactly as it should appear',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
			},
			{
				displayName: 'When',
				name: 'when',
				type: 'options',
				options: [
					{ name: 'Next Queue Slot', value: 'queue', description: 'The account\'s next free posting time' },
					{ name: 'At a Time', value: 'at' },
					{ name: 'Now', value: 'now', description: 'Publish right away' },
				],
				default: 'queue',
				displayOptions: { show: { resource: ['post'], operation: ['create'] } },
			},
			{
				displayName: 'Scheduled At',
				name: 'scheduledAt',
				type: 'dateTime',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['post'], operation: ['create'], when: ['at'] } },
			},
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['post'], operation: ['delete'] } },
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Canceled', value: 'canceled' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Proposed', value: 'proposed' },
					{ name: 'Published', value: 'published' },
					{ name: 'Scheduled', value: 'scheduled' },
				],
				default: '',
				displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 50 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
			},
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const { connections } = (await api(this, 'GET', '/api/connections')) as { connections: Connection[] };
				return connections.filter(postable).map((c) => ({
					name: `${c.displayName ?? c.handle} (${c.platform})`,
					value: c.id,
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				if (resource === 'account') {
					const { connections } = (await api(this, 'GET', '/api/connections')) as { connections: Connection[] };
					for (const c of connections.filter(postable)) {
						out.push({ json: { connectionId: c.id, platform: c.platform, handle: c.handle, name: c.displayName ?? c.handle }, pairedItem: i });
					}
				} else if (operation === 'create') {
					const body: IDataObject = {
						connectionId: this.getNodeParameter('connectionId', i) as string,
						postText: this.getNodeParameter('text', i) as string,
					};
					const when = this.getNodeParameter('when', i) as string;
					if (when === 'at') body.scheduledAt = new Date(this.getNodeParameter('scheduledAt', i) as string).toISOString();
					else if (when === 'queue') body.queue = true;
					out.push({ json: await api(this, 'POST', '/api/posts', body), pairedItem: i });
				} else if (operation === 'delete') {
					const id = encodeURIComponent(this.getNodeParameter('postId', i) as string);
					out.push({ json: await api(this, 'DELETE', `/api/posts/${id}`), pairedItem: i });
				} else {
					const status = this.getNodeParameter('status', i) as string;
					const qs: IDataObject = { limit: this.getNodeParameter('limit', i) as number };
					if (status) qs.status = status;
					const { posts } = (await api(this, 'GET', '/api/posts', undefined, qs)) as { posts: IDataObject[] };
					for (const p of posts) out.push({ json: p, pairedItem: i });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: i });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}
