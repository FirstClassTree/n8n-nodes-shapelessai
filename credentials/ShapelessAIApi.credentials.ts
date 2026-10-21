import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class ShapelessAIApi implements ICredentialType {
	name = 'shapelessAIApi';
	displayName = 'ShapelessAI API';
	documentationUrl = 'https://shapelessai.com/docs/api';
	icon: Icon = 'file:../nodes/ShapelessAi/shapelessai.svg';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'An slk_ key. Make one at https://shapelessai.com/docs/api.',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};
	test: ICredentialTestRequest = { request: { baseURL: 'https://shapelessai.com', url: '/api/me' } };
}
