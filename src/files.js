/**
 * SPDX-FileCopyrightText: 2020 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import './init-shared.js'

import '../css/filetypes.scss'
import '../css/files.scss'

import { emit } from '@nextcloud/event-bus'
import { imagePath, generateOcsUrl, generateUrl, generateFilePath } from '@nextcloud/router'
import { showError } from '@nextcloud/dialogs'
import { getDocumentUrlFromTemplate, getDocumentUrlForPublicFile, getDocumentUrlForFile } from './helpers/url.js'
import PostMessageService from './services/postMessage.tsx'
import Config from './services/config.tsx'
import Types from './helpers/types.js'
import FilesAppIntegration from './view/FilesAppIntegration.js'
import { splitPath } from './helpers/index.js'
import { enableScrollLock, disableScrollLock } from './helpers/safariFixer.js'
import NewFileMenu from './view/NewFileMenu.js'
import { getCapabilities } from './services/capabilities.ts'

const FRAME_DOCUMENT = 'FRAME_DOCUMENT'
const PostMessages = new PostMessageService({
	FRAME_DOCUMENT: () => document.getElementById('richdocumentsframe').contentWindow,
})

const isDownloadHidden = document.getElementById('hideDownload') && document.getElementById('hideDownload').value === 'true'

const isPublic = document.getElementById('isPublic') && document.getElementById('isPublic').value === '1'

const odfViewer = {

	open: false,
	receivedLoading: false,
	isProxyStarting: false,
	isCollaboraConfigured: (
		(getCapabilities().config.wopi_url.indexOf('proxy.php') !== -1)
		|| (typeof getCapabilities().collabora === 'object' && getCapabilities().collabora.length !== 0)),
	supportedMimes: getCapabilities().mimetypes.concat(getCapabilities().mimetypesNoDefaultOpen),
	excludeMimeFromDefaultOpen: getCapabilities().mimetypesNoDefaultOpen,
	hideDownloadMimes: getCapabilities().mimetypesSecureView,

	onEdit(fileName, context) {
		let fileDir
		let fileId
		let templateId

		enableScrollLock()

		if (!odfViewer.isCollaboraConfigured) {
			$.get(generateOcsUrl('cloud/capabilities?format=json')).then(
				e => {
					if ((getCapabilities().config.wopi_url.indexOf('proxy.php') !== -1)
						|| (typeof e.ocs.data.capabilities.richdocuments.collabora === 'object'
						&& e.ocs.data.capabilities.richdocuments.collabora.length !== 0)) {
						odfViewer.isCollaboraConfigured = true
						odfViewer.onEdit(fileName, context)
					} else {
						const setupUrl = generateUrl('/settings/admin/richdocuments')
						const installHint = OC.isUserAdmin()
							? `<a href="${setupUrl}">Collabora Online is not setup yet. <br />Click here to configure your own server or connect to a demo server.</a>`
							: t('richdocuments', 'Collabora Online is not setup yet. Please contact your administrator.')

						showError(installHint, {
							isHTML: true,
							timeout: 0,
						})
					}
				},
			)
			return
		}
		if (odfViewer.open === true) {
			return
		}
		odfViewer.open = true
		if (context) {
			if (context?.$file?.attr('data-mounttype') === 'external-session') {
				showError(t('richdocuments', 'Opening the file is not supported, since the credentials for the external storage are not available without a session'), {
					timeout: 0,
				})
				odfViewer.open = false
				return
			}
			fileDir = context.dir
			fileId = context.fileId || context.$file?.attr('data-id')
			templateId = context.templateId
		}
		FilesAppIntegration.startLoading()
		odfViewer.receivedLoading = false

		let documentUrl = getDocumentUrlForFile(fileDir, fileId)
		if (isPublic) {
			documentUrl = getDocumentUrlForPublicFile(fileName, fileId)
		}
		if (typeof (templateId) !== 'undefined') {
			documentUrl = getDocumentUrlFromTemplate(templateId, fileName, fileDir)
		}

		$('head').append($('<link rel="stylesheet" type="text/css" href="' + generateFilePath('richdocuments', 'css', 'mobile.css') + '"/>'))

		const $iframe = $('<iframe data-cy="documentframe" id="richdocumentsframe" nonce="' + btoa(OC.requestToken) + '" scrolling="no" allowfullscreen allow="clipboard-read *; clipboard-write *" src="' + documentUrl + '" />')
		odfViewer.loadingTimeout = setTimeout(odfViewer.onTimeout,
			(getCapabilities().config.timeout * 1000 || 15000))
		$iframe.src = documentUrl

		if ((OC.appswebroots.richdocumentscode || OC.appswebroots.richdocumentscode_arm64)
			&& getCapabilities().config.wopi_url.indexOf('proxy.php') >= 0) {
			odfViewer.checkProxyStatus()
		}

		$('body').css('overscroll-behavior-y', 'none')
		const viewport = document.querySelector('meta[name=viewport]')
		viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
		if (isPublic) {
			$('body').append($iframe)
			$iframe.addClass('full')
			$('#content').addClass('full-height')
			$('footer').addClass('hidden')
			$('#controls').addClass('hidden')
			$('#content').addClass('loading')
		} else {
			$('body').css('overflow', 'hidden')
			$('body').append($iframe)
			$iframe.addClass('full')
			$iframe.hide()
		}

		$('#app-content #controls').addClass('hidden')
		setTimeout(() => {
			FilesAppIntegration.init({
				fileName,
				fileId,
				filePath: fileDir,
				fileList: context ? context.fileList : undefined,
				fileModel: context ? context.fileModel : undefined,
				sendPostMessage: (msgId, values) => {
					PostMessages.sendWOPIPostMessage(FRAME_DOCUMENT, msgId, values)
				},
			})
			emit('richdocuments:file-open:started', {
				...FilesAppIntegration.loggingContext(),
			})
		})
	},

	onReceiveLoading() {
		odfViewer.receivedLoading = true
		$('#richdocumentsframe').prop('title', 'Collabora Online')
		$('#richdocumentsframe').show()
		$('html, body').scrollTop(0)
		$('#content').removeClass('loading')
		FilesAppIntegration.initAfterReady()
	},

	onClose() {
		disableScrollLock()
		odfViewer.open = false
		clearTimeout(odfViewer.loadingTimeout)
		odfViewer.receivedLoading = false
		$('link[href*="richdocuments/css/mobile"]').remove()
		$('#app-content #controls').removeClass('hidden')
		$('#richdocumentsframe').remove()
		$('.searchbox').show()
		$('body').css('overflow', 'auto')

		if (isPublic) {
			$('#content').removeClass('full-height')
			$('footer').removeClass('hidden')
			$('.directLink').removeClass('hidden')
			$('.directDownload').removeClass('hidden')
		}

		OC.Util.History.replaceState()

		FilesAppIntegration.close()
	},

	onTimeout() {
		if (!odfViewer.receivedLoading && !odfViewer.isProxyStarting) {
			emit('richdocuments:file-open:failed', {
				reason: 'timeout',
				...FilesAppIntegration.loggingContext(),
			})
			odfViewer.onClose()
			OC.Notification.showTemporary(t('richdocuments', 'Failed to load {productName} - please try again later', { productName: getCapabilities().productName || 'Collabora Online' }))
		} else if (!odfViewer.receivedLoading) {
			odfViewer.loadingTimeout = setTimeout(odfViewer.onTimeout,
				(getCapabilities().config.timeout * 1000 || 15000))
		}
	},

	checkProxyStatus() {
		const wopiUrl = getCapabilities().config.wopi_url
		const url = wopiUrl.slice(0, wopiUrl.indexOf('proxy.php') + 'proxy.php'.length)
		$.get(url + '?status').done(function(result) {
			if (result && result.status) {
				if (result.status === 'OK' || result.status === 'error') {
					odfViewer.isProxyStarting = false
				} else if (result.status === 'starting'
					|| result.status === 'stopped'
					|| result.status === 'restarting') {
					odfViewer.isProxyStarting = true

					setTimeout(function() {
						odfViewer.checkProxyStatus()
					}, 1000)
				}
			}
		})
	},
}

const settings = getCapabilities().config || {}
Config.update('ooxml', settings.doc_format === 'ooxml')

window.OCA.RichDocuments = {
	config: {
		create: Types.getFileTypes(),
	},
	open: ({ path, fileId, fileModel, fileList = {} }) => {
		const [dir, file] = splitPath(path)
		odfViewer.onEdit(file, {
			fileId,
			dir,
			shareOwnerId: fileModel.get('shareOwnerId'),
			fileList,
			fileModel,
		})
	},
	openWithTemplate: ({ path, fileId, templateId, fileModel, fileList = {} }) => {
		const [dir, file] = splitPath(path)
		odfViewer.onEdit(file, {
			fileId,
			dir,
			templateId,
			shareOwnerId: fileModel.get('shareOwnerId'),
			fileList,
			fileModel,
		})
	},
	FilesAppIntegration: {
		registerHandler: FilesAppIntegration.registerHandler.bind(FilesAppIntegration),
	},
}

addEventListener('DOMContentLoaded', () => {
	// register file actions and menu
	if (typeof OCA !== 'undefined'
		&& typeof OCA.Files !== 'undefined'
		&& typeof OCA.Files.fileActions !== 'undefined'
	) {
		if (isPublic) {
			OC.Plugins.register('OCA.Files.NewFileMenu', NewFileMenu)
		}
	}

	OC.MimeType._mimeTypeIcons['application/vnd.oasis.opendocument.graphics'] = imagePath('richdocuments', 'x-office-draw')

	// Open documents if a public page is opened for a supported mimetype
	const isSupportedMime = isPublic && odfViewer.supportedMimes.indexOf($('#mimetype').val()) !== -1 && odfViewer.excludeMimeFromDefaultOpen.indexOf($('#mimetype').val()) === -1
	const showSecureView = isPublic && isDownloadHidden && odfViewer.hideDownloadMimes.indexOf($('#mimetype').val()) !== -1
	if (!isSupportedMime && !showSecureView) {
		return
	}

	PostMessages.registerPostMessageHandler(({ parsed }) => {
		console.debug('[viewer] Received post message', parsed)
		const { msgId, args, deprecated } = parsed
		if (deprecated) { return }

		switch (msgId) {
		case 'NC_ShowNamePicker':
			clearTimeout(odfViewer.loadingTimeout)
			break
		case 'loading':
			odfViewer.onReceiveLoading()
			break
		case 'Action_Load_Resp':
			if (!args?.success) {
				emit('richdocuments:file-open:failed', {
					reason: 'collabora',
					collaboraResponse: parsed?.args?.errorMsg,
					...FilesAppIntegration.loggingContext(),
				})
			} else {
				emit('richdocuments:file-open:succeeded', {
					...FilesAppIntegration.loggingContext(),
				})
			}
			break
		case 'App_LoadingStatus':
			if (args.Status === 'Timeout') {
				emit('richdocuments:file-open:failed', {
					reason: 'timeout',
					...FilesAppIntegration.loggingContext(),
				})
				odfViewer.onClose()
				OC.Notification.showTemporary(t('richdocuments', 'Failed to connect to {productName}. Please try again later or contact your server administrator.',
					{ productName: getCapabilities().productName },
				))
			}
			break
		case 'UI_Share':
			FilesAppIntegration.share()
			break
		case 'UI_CreateFile':
			FilesAppIntegration.createNewFile(args.DocumentType)
			break
		case 'UI_InsertGraphic':
			FilesAppIntegration.insertGraphic((filename, url) => {
				PostMessages.sendWOPIPostMessage(FRAME_DOCUMENT, 'postAsset', { FileName: filename, Url: url })
			})
			break
		case 'File_Rename':
			FilesAppIntegration.rename(args.NewName)
			break
		case 'Action_Save_Resp':
			FilesAppIntegration.saveAs(args.fileName)
			break
		case 'close':
			odfViewer.onClose()
			break
		case 'Get_Views_Resp':
		case 'Views_List':
			FilesAppIntegration.setViews(args)
			break
		case 'UI_FileVersions':
		case 'rev-history':
			FilesAppIntegration.showRevHistory()
			break
		case 'App_VersionRestore':
			if (args.Status === 'Pre_Restore_Ack') {
				FilesAppIntegration.restoreVersionExecute()
			}
			break
		}

		// legacy view handling
		if (msgId === 'View_Added') {
			FilesAppIntegration.views[args.ViewId] = args
			FilesAppIntegration.renderAvatars()
		} else if (msgId === 'View_Removed') {
			delete FilesAppIntegration.views[args.ViewId]
			FilesAppIntegration.renderAvatars()
		} else if (msgId === 'FollowUser_Changed') {
			if (args.IsFollowEditor) {
				FilesAppIntegration.followingEditor = true
			} else {
				FilesAppIntegration.followingEditor = false
			}
			if (args.IsFollowUser) {
				FilesAppIntegration.following = args.FollowedViewId
			} else {
				FilesAppIntegration.following = null
			}
			FilesAppIntegration.renderAvatars()
		}

	})
})
