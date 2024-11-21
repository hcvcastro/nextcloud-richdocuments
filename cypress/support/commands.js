/**
 * SPDX-FileLicenseText: 2023 Julius Härtl <jus@bitgrid.net>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 */

import { basename } from 'path'
import axios from '@nextcloud/axios'
import { User, addCommands } from '@nextcloud/cypress'

addCommands()

const url = Cypress.config('baseUrl').replace(/\/index.php\/?$/g, '')
Cypress.env('baseUrl', url)

Cypress.Commands.add('logout', (route = '/') => {
	cy.session('_guest', function() {
	})
})

/**
 * cy.uploadedFile - uploads a file from the fixtures folder
 *
 * @param {User} user the owner of the file, e.g. admin
 * @param {string} fixture the fixture file name, e.g. image1.jpg
 * @param {string} mimeType e.g. image/png
 * @param {string} [target] the target of the file relative to the user root
 */
Cypress.Commands.add('uploadFile', (user, fixture, mimeType, target = `/${fixture}`) => {
	cy.clearCookies()
	const fileName = basename(target)

	// get fixture
	return cy.fixture(fixture, 'base64').then(async file => {
		// convert the base64 string to a blob
		const blob = Cypress.Blob.base64StringToBlob(file, mimeType)

		// Process paths
		const rootPath = `${Cypress.env('baseUrl')}/remote.php/dav/files/${encodeURIComponent(user.userId)}`
		const filePath = target.split('/').map(encodeURIComponent).join('/')
		try {
			const file = new File([blob], fileName, { type: mimeType })
			await axios({
				url: `${rootPath}${filePath}`,
				method: 'PUT',
				data: file,
				headers: {
					'Content-Type': mimeType,
				},
				auth: {
					username: user.userId,
					password: user.password,
				},
			}).then(response => {
				cy.log(`Uploaded ${fixture} as ${fileName}`, response)
			})
		} catch (error) {
			cy.log(error)
			throw new Error(`Unable to process fixture ${fixture}`)
		}
	})

})

Cypress.Commands.add('ocsRequest', (user, options) => {
	const auth = { user: user.userId, password: user.password }
	return cy.request({
		form: true,
		auth,
		headers: {
			'OCS-ApiRequest': 'true',
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		...options,
	})
})
Cypress.Commands.add('shareFileToUser', (user, path, targetUser, shareData = {}) => {
	cy.login(user)
	cy.ocsRequest(user, {
		method: 'POST',
		url: `${url}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
		body: {
			path,
			shareType: 0,
			shareWith: targetUser.userId,
			...shareData,
		},
	}).then(response => {
		cy.log(`${user.userId} shared ${path} with ${targetUser.userId}`, response.status)
	})
})

Cypress.Commands.add('openFile', fileName => {
	cy.get(`.files-filestable:visible tr[data-file="${fileName}"] a.name`).click()
})

Cypress.Commands.add('iframe', { prevSubject: 'element' }, $iframe => {
	return $iframe.contents().find('body')
})

Cypress.Commands.add('nextcloudEnableApp', (appId) => {
	cy.login(new User('admin', 'admin'))
	cy.request({
		method: 'POST',
		url: `${Cypress.env('baseUrl')}/ocs/v1.php/cloud/apps/${appId}?format=json`,
		form: true,
		auth: { user: 'admin', pass: 'admin' },
		headers: {
			'OCS-ApiRequest': 'true',
			'Content-Type': 'application/x-www-form-urlencoded',
		},
	}).then(response => {
		cy.log(`Enabled app ${appId}`, response.status)
	})
})

Cypress.Commands.add('nextcloudTestingAppConfigSet', (appId, configKey, configValue) => {
	cy.login(new User('admin', 'admin'))
	cy.request({
		method: 'POST',
		url: `${Cypress.env('baseUrl')}/ocs/v1.php/apps/testing/api/v1/app/${appId}/${configKey}?format=json`,
		auth: { user: 'admin', pass: 'admin' },
		headers: {
			'OCS-ApiRequest': 'true',
			Cookie: '',
		},
		body: {
			value: configValue,
		},
	}).then(response => {
		cy.log(`Set app value app ${appId} ${configKey} ${configValue}`, response.status)
	})
})

Cypress.Commands.add('waitForViewer', () => {
	cy.get('#viewer', { timeout: 30000 })
		.should('be.visible')
		.and('have.class', 'modal-mask')
		.and('not.have.class', 'icon-loading')
})
Cypress.Commands.add('waitForCollabora', () => {
	cy.get('#collaboraframe', { timeout: 30000 }).iframe().should('exist').as('collaboraframe')
	cy.get('@collaboraframe').within(() => {
		cy.get('#loleafletframe', { timeout: 30000 }).iframe().should('exist').as('loleafletframe')
	})

	cy.get('@loleafletframe').find('#main-document-content').should('exist')
})
