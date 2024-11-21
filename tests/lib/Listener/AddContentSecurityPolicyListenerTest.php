<?php

declare(strict_types=1);

/**
 * @copyright Copyright (c) 2022 Julius Härtl <jus@bitgrid.net>
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
 *
 */

use OC\Security\CSP\ContentSecurityPolicyManager;
use OCA\Richdocuments\AppConfig;
use OCA\Richdocuments\Listener\AddContentSecurityPolicyListener;
use OCA\Richdocuments\Service\FederationService;
use OCP\App\IAppManager;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\GlobalScale\IConfig as GlobalScaleConfig;
use OCP\IConfig;
use OCP\IRequest;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;
use PHPUnit\Framework\MockObject\MockObject;
use Test\TestCase;

/**
 * @group DB
 */
class AddContentSecurityPolicyListenerTest extends TestCase {
	/** @var IRequest|MockObject */
	private $request;
	/** @var AppConfig|MockObject */
	private $config;
	/** @var IAppManager|MockObject */
	private $appManager;
	/** @var GlobalScaleConfig|MockObject */
	private $gsConfig;
	/** @var FederationService|MockObject */
	private $federationService;
	private AddContentSecurityPolicyListener $listener;

	public function setUp(): void {
		parent::setUp();

		$this->appManager = $this->createMock(IAppManager::class);
		$this->gsConfig = $this->createMock(GlobalScaleConfig::class);
		$this->federationService = $this->createMock(FederationService::class);

		$this->overwriteService(FederationService::class, $this->federationService);

		$this->request = $this->createMock(IRequest::class);
		$this->request->method('getPathInfo')
			->willReturn('/apps/files');

		$this->config = $this->getMockBuilder(AppConfig::class)
			->setConstructorArgs([
				$this->createMock(IConfig::class),
				$this->appManager,
				$this->gsConfig,
			])
			->onlyMethods(['getCollaboraUrlPublic', 'getGlobalScaleTrustedHosts'])
			->getMock();


		$this->listener = new AddContentSecurityPolicyListener(
			$this->request,
			$this->config,
		);
	}

	private function getMergedPolicy(): ContentSecurityPolicy {
		$eventDispatcher = $this->createMock(IEventDispatcher::class);
		$eventDispatcher->expects(self::once())
			->method('dispatchTyped')
			->willReturnCallback(function ($event) {
				$this->listener->handle($event);
			});
		$manager = new ContentSecurityPolicyManager($eventDispatcher);

		return $manager->getDefaultPolicy();
	}

	private function expectPageLoad(): void {
		$this->request->expects(self::once())
			->method('getScriptName')
			->willReturn('index.php');
	}

	public function testHandle() {
		$this->expectPageLoad();
		$this->config->expects(self::any())
			->method('getCollaboraUrlPublic')
			->willReturn('http://public');

		$policy = $this->getMergedPolicy();

		self::assertEquals(["'self'", "nc:" , "http://public"], $policy->getAllowedFrameDomains());
		self::assertEquals(["'self'", "http://public"], $policy->getAllowedFormActionDomains());
	}

	public function testHandleRemote() {
		$manager = $this->createMock(ContentSecurityPolicyManager::class);
		$event = new AddContentSecurityPolicyEvent(
			$manager
		);

		$this->request->expects(self::once())
			->method('getScriptName')
			->willReturn('remote.php');

		$manager->expects(self::never())
			->method('addDefaultPolicy');
		$this->listener->handle($event);
	}

	public function testNotSetup() {
		$this->expectPageLoad();
		$this->config->expects(self::any())
			->method('getCollaboraUrlPublic')
			->willReturn('');

		$policy = $this->getMergedPolicy();

		self::assertEquals(["'self'", "nc:"], $policy->getAllowedFrameDomains());
		self::assertEquals(["'self'"], $policy->getAllowedFormActionDomains());
	}

	public function testWopiUrlPublic() {
		$this->expectPageLoad();
		$this->config->expects(self::any())
			->method('getCollaboraUrlPublic')
			->willReturn('http://public');

		$policy = $this->getMergedPolicy();

		self::assertEquals(["'self'", "nc:", "http://public"], $policy->getAllowedFrameDomains());
		self::assertEquals(["'self'", "http://public"], $policy->getAllowedFormActionDomains());
	}

	public function testWopiUrl() {
		$this->expectPageLoad();
		$this->config->expects(self::any())
			->method('getCollaboraUrlPublic')
			->willReturn('https://public/collabora/');

		$policy = $this->getMergedPolicy();

		self::assertEquals(["'self'", "nc:", "https://public"], $policy->getAllowedFrameDomains());
		self::assertEquals(["'self'", "https://public"], $policy->getAllowedFormActionDomains());
	}

	public function testGS() {
		$this->expectPageLoad();
		$this->config->expects(self::any())
			->method('getCollaboraUrlPublic')
			->willReturn('https://public/collabora/');
		$this->gsConfig->expects(self::any())
			->method('isGlobalScaleEnabled')
			->willReturn(true);
		$this->config->expects(self::any())
			->method('getGlobalScaleTrustedHosts')
			->willReturn(['*.example.com']);

		$policy = $this->getMergedPolicy();

		self::assertEquals(["'self'", "nc:", "https://public", "*.example.com"], $policy->getAllowedFrameDomains());
		self::assertEquals(["'self'", "https://public", "*.example.com"], $policy->getAllowedFormActionDomains());
	}

	public function testNoGS() {
		$this->expectPageLoad();
		$this->config->expects(self::any())
			->method('getCollaboraUrlPublic')
			->willReturn('http://internal');
		$this->gsConfig->expects(self::any())
			->method('isGlobalScaleEnabled')
			->willReturn(false);

		$policy = $this->getMergedPolicy();

		self::assertEquals(["'self'", "nc:", "http://internal"], $policy->getAllowedFrameDomains());
		self::assertEquals(["'self'", "http://internal"], $policy->getAllowedFormActionDomains());
	}

	public function testHandleMerged() {
		$this->expectPageLoad();
		$this->config->expects(self::any())
			->method('getCollaboraUrlPublic')
			->willReturn('http://public');

		$eventDispatcher = $this->createMock(IEventDispatcher::class);
		$eventDispatcher->expects(self::once())
			->method('dispatchTyped')
			->willReturnCallback(function (AddContentSecurityPolicyEvent $event) {
				$otherPolicy = new EmptyContentSecurityPolicy();
				$otherPolicy->addAllowedFrameDomain('external.example.com');
				$otherPolicy->addAllowedFormActionDomain('external.example.com');
				$event->addPolicy($otherPolicy);

				$this->listener->handle($event);
			});
		$manager = new ContentSecurityPolicyManager($eventDispatcher);

		$policy = $manager->getDefaultPolicy();

		self::assertArrayUnordered(["'self'", "external.example.com", "http://public", "nc:"], $policy->getAllowedFrameDomains(), "Domains are equal", 0.0, 10, true);
		self::assertArrayUnordered(["'self'", "external.example.com", "http://public"], $policy->getAllowedFormActionDomains());
	}

	public static function assertArrayUnordered($expected, $actual, $msg = '') {
		sort($expected);
		sort($actual);
		self::assertSame($expected, $actual, $msg);
	}
}
