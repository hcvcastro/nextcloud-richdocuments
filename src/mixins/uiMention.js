/*
 * @copyright Copyright (c) 2023 Julius Härtl <jus@bitgrid.net>
 *
 * @author Julius Härtl <jus@bitgrid.net>
 *
 * @license GNU AGPL version 3 or any later version
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
 */

import { generateOcsUrl } from '@nextcloud/router'
import axios from '@nextcloud/axios'
import Config from '../services/config.tsx'
import { getNextcloudUrl } from '../helpers/url.js'

export default {
	methods: {
		async uiMention(search) {
			let users = []

			if (Config.get('userId') !== null) {
				try {
					const result = await axios.get(generateOcsUrl('core/autocomplete/get'), {
						params: { search },
					})
					users = result.data.ocs.data
				} catch (e) { }
			}

			const list = users.map((user) => {
				const profile = window.location.protocol + '//' + getNextcloudUrl() + '/index.php/u/' + user.id
				return { username: user.label, profile }
			})

			this.sendPostMessage('Action_Mention', { list })
		},
	},
}
