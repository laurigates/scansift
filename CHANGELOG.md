# Changelog

## [0.2.0](https://github.com/laurigates/scansift/compare/scansift-v0.1.0...scansift-v0.2.0) (2026-06-06)


### Features

* **api:** add REST routes and WebSocket handlers ([6cc4db0](https://github.com/laurigates/scansift/commit/6cc4db05478a6b39ee46b54fef9c99f8327fbaef))
* **ci:** add docs-quality workflow (lint, link-check, AI freshness) ([#34](https://github.com/laurigates/scansift/issues/34)) ([64549b0](https://github.com/laurigates/scansift/commit/64549b04459f3bbb36e5665c4625c93a4d93e0f4))
* **detection:** implement photo detection with edge analysis ([cb00864](https://github.com/laurigates/scansift/commit/cb008640f95b051efd61f719e4191956a0694bc7))
* initial project setup with TypeScript full-stack configuration ([847b8ac](https://github.com/laurigates/scansift/commit/847b8acd63ce718ec9faf90b58e534f69dd98cfb))
* **ocr:** tesseract.js metadata extraction with chrono-node date parsing ([#27](https://github.com/laurigates/scansift/issues/27)) ([02aa56d](https://github.com/laurigates/scansift/commit/02aa56d655e52fc408344b8cd983483ba68c5222))
* **orchestration:** add scan workflow state machine ([9d7a0db](https://github.com/laurigates/scansift/commit/9d7a0db5f46675f0071e13617ea958c3733e5cfb))
* **orchestrator:** scan:cancel and scan:skip-backs handlers ([#29](https://github.com/laurigates/scansift/issues/29)) ([a4d1b51](https://github.com/laurigates/scansift/commit/a4d1b510b7d735ef16b7845bb2c68b00e489c35d))
* **processing:** add photo cropping, pairing, and eSCL client ([50614cd](https://github.com/laurigates/scansift/commit/50614cd48a10f2bfdce3bb05abc9bd1aa4dd46d0))
* **scanner:** add eSCL scanner discovery and test utilities ([cb6c2ff](https://github.com/laurigates/scansift/commit/cb6c2ffd2551d498e64088338967e44a6a126169))
* **stats:** wire /api/stats to real Drizzle counts ([#28](https://github.com/laurigates/scansift/issues/28)) ([4780bc2](https://github.com/laurigates/scansift/commit/4780bc29c4b609ea55f259802f3a80b60324c4ef))
* **ui:** enhance scanning UI with progress and preview ([361bc12](https://github.com/laurigates/scansift/commit/361bc12fc4d64779683778cc284264a12494def9))


### Bug Fixes

* **ci:** migrate release-please to org reusable workflow ([#32](https://github.com/laurigates/scansift/issues/32)) ([2b1c5df](https://github.com/laurigates/scansift/commit/2b1c5dfd286d61ddd9ec94b68e0afb202c500b77))
* resolve build and test workflow issues ([08c59d4](https://github.com/laurigates/scansift/commit/08c59d45da51db9a314ee343e583e3e079075e12))
* resolve TypeScript errors and PostCSS build issue ([70343dd](https://github.com/laurigates/scansift/commit/70343ddf878880cc8ad080412d39a7125150086c))
* use bun instead of pnpm in Playwright webServer command ([1fb543d](https://github.com/laurigates/scansift/commit/1fb543d5cd13168f9a8fda4e200373051ee2dd1c))


### Documentation

* add CLAUDE.md project guide ([3bfa3d6](https://github.com/laurigates/scansift/commit/3bfa3d662266b853e121af5243d69ca8c5162068))
* add MIT license and enhance README with logo and badges ([73d9a1b](https://github.com/laurigates/scansift/commit/73d9a1be8c7a20f09d64350bd05269bbb0cf2b55))
* add OpenCV setup guide for alternative detection ([cc328be](https://github.com/laurigates/scansift/commit/cc328bea45306aa7f218f1dc5116f31681b6d22f))
* add README with project overview and setup instructions ([5eb3add](https://github.com/laurigates/scansift/commit/5eb3add0e623c041894734d36a4b3e23c8c8ddb2))
* initialize blueprint with PRD and ADRs ([85c80e8](https://github.com/laurigates/scansift/commit/85c80e854334b35ddc1f0df20245e35bbe7284b9))
* reconcile blueprint state with codebase reality ([#22](https://github.com/laurigates/scansift/issues/22)) ([3e2b076](https://github.com/laurigates/scansift/commit/3e2b07600081862d0518444ee4b5695050b5d8ff))
* update work-overview with Phase 0 completion ([f7619f5](https://github.com/laurigates/scansift/commit/f7619f524566b17d45b210b66820f380f87d98c5))
* upgrade blueprint to format v3.3.0 ([#19](https://github.com/laurigates/scansift/issues/19)) ([a635b63](https://github.com/laurigates/scansift/commit/a635b63ced39f948f73ea7192a108698166c4dbd))
