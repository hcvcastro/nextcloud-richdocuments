/**
 * @copyright Copyright (c) 2013 Viktar Dubiniuk <dubiniuk@owncloud.com>
 *
 * @author Viktar Dubiniuk <dubiniuk@owncloud.com>
 * @author Julius Härtl <jus@bitgrid.net>
 *
 * @license AGPL-3.0-or-later
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

import './init-shared.js'
import '../css/filetypes.scss'

import Office from './view/Office.vue'
import { getCapabilities } from '@nextcloud/capabilities'

const supportedMimes = getCapabilities().richdocuments.mimetypes

if (OCA.Viewer) {
	OCA.Viewer.registerHandler({
		id: 'richdocuments',
		group: null,
		mimes: supportedMimes,
		component: Office,
		theme: 'light',
		canCompare: true,
	})
}

// TODO: Viewer.openWith introduced with https://github.com/nextcloud/viewer/pull/1273
//       This check can be replaced with `if(OCA.Viewer)` once NC 24 is EOL.
if (OCA.Viewer.openWith && OCA?.Files?.fileActions) {
	const supportedMimes = getCapabilities().richdocuments.mimetypesNoDefaultOpen
	const actionName = 'Edit with ' + getCapabilities().richdocuments.productName
	const actionDisplayNameEdit = t('richdocuments', 'Edit with {productName}', { productName: getCapabilities().richdocuments.productName }, undefined, { escape: false })
	const actionDisplayNameOpen = t('richdocuments', 'Open with {productName}', { productName: getCapabilities().richdocuments.productName }, undefined, { escape: false })

	for (const mime of supportedMimes) {
		const action = {
			name: actionName,
			mime,
			permissions: OC.PERMISSION_READ,
			iconClass: 'icon-richdocuments',
			displayName: mime === 'application/pdf' ? actionDisplayNameOpen : actionDisplayNameEdit,
			actionHandler: (fileName, context) => {
				OCA.Viewer.openWith('richdocuments', {
					path: context.fileInfoModel.getFullPath(),
				})
			},
		}

		OCA.Files.fileActions.registerAction(action)
	}
}
