/**
 * Laya App 商店截圖生成器 - 畫布直點編輯文字、直點上傳圖片/影片、拖拽文件上傳與磁吸對齊控制器
 */
(function (global) {
  'use strict';

  const SNAP_THRESHOLD = 8;

  class StageInteraction {
    constructor(options) {
      this.overlayCanvas = options.overlayCanvas;
      this.renderer = options.renderer;
      this.getState = options.getState;
      this.onOffsetChange = options.onOffsetChange;
      this.onSelectElement = options.onSelectElement;
      this.onToggleCardVideo = options.onToggleCardVideo;
      this.onHideElement = options.onHideElement || function () {};
      this.onDirectClickElement = options.onDirectClickElement || function () {};
      this.onDropFileOnElement = options.onDropFileOnElement || function () {};
      this.onScaleElement = options.onScaleElement || function () {};

      this.dragMode = 'element';
      this.enableSnap = true;
      this.enableDrag = true;

      this.uiState = {
        hoveredBox: null,
        selectedBox: null,
        hoveredCardId: null,
        guides: []
      };

      this.dragging = null;
      this.resizing = null;
      this.bindEvents();
    }

    get W() {
      return this.overlayCanvas.width || 1920;
    }

    get H() {
      return this.overlayCanvas.height || 1080;
    }

    toStageCoords(clientX, clientY) {
      const rect = this.overlayCanvas.getBoundingClientRect();
      const scaleX = this.W / Math.max(1, rect.width);
      const scaleY = this.H / Math.max(1, rect.height);
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    findDeleteActionHit(sx, sy) {
      const db = this.renderer.deleteActionBox;
      if (!db) return null;
      if (sx >= db.x && sx <= db.x + db.w && sy >= db.y && sy <= db.y + db.h) {
        return db;
      }
      return null;
    }

    findResizeActionHit(sx, sy) {
      const rb = this.renderer.resizeActionBox;
      if (!rb) return null;
      if (sx >= rb.x && sx <= rb.x + rb.w && sy >= rb.y && sy <= rb.y + rb.h) {
        return rb;
      }
      return null;
    }

    findHitBox(sx, sy, forceModule) {
      const boxes = this.renderer.hitBoxes || [];
      const useModuleOnly = forceModule || this.dragMode === 'module';

      if (useModuleOnly) {
        return (
          boxes.find(
            (b) => b.kind === 'module' && sx >= b.x && sx <= b.right && sy >= b.y && sy <= b.bottom
          ) || null
        );
      }

      const matches = boxes.filter(
        (b) => sx >= b.x && sx <= b.right && sy >= b.y && sy <= b.bottom
      );
      if (!matches.length) return null;

      const elements = matches.filter((b) => b.kind === 'element');
      if (elements.length > 0) {
        elements.sort((a, b) => {
          const aCustom = String(a.key || '').startsWith('custom_el_') ? 1 : 0;
          const bCustom = String(b.key || '').startsWith('custom_el_') ? 1 : 0;
          if (aCustom !== bCustom) return bCustom - aCustom;
          return a.w * a.h - b.w * b.h;
        });
        return elements[0];
      }
      return matches[0];
    }

    findPlayHit(sx, sy) {
      const pbs = this.renderer.playButtons || [];
      for (const pb of pbs) {
        if (!pb.isVideo) continue;
        const inCorner = sx >= pb.x && sx <= pb.x + pb.w && sy >= pb.y && sy <= pb.y + pb.h;
        const midX = pb.cardX + pb.cardW / 2;
        const midY = pb.cardY + pb.mediaH / 2;
        const distCenter = Math.hypot(sx - midX, sy - midY);
        if (inCorner || distCenter <= 44) {
          return pb;
        }
      }
      return null;
    }

    findHoveredVideoCardId(sx, sy) {
      const pbs = this.renderer.playButtons || [];
      for (const pb of pbs) {
        if (
          pb.isVideo &&
          sx >= pb.cardX &&
          sx <= pb.cardX + pb.cardW &&
          sy >= pb.cardY &&
          sy <= pb.cardY + pb.mediaH
        ) {
          return pb;
        }
      }
      return null;
    }

    bindEvents() {
      const el = this.overlayCanvas;

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const pt = this.toStageCoords(e.clientX, e.clientY);

        // 0) 點擊選中框旁的紅色「✕ 刪除」按鈕
        const delHit = this.findDeleteActionHit(pt.x, pt.y);
        if (delHit) {
          this.uiState.selectedBox = null;
          this.uiState.hoveredBox = null;
          this.uiState.guides = [];
          this.onHideElement(delHit.key, delHit.label);
          return;
        }

        // 0b) 點擊選中框右下角縮放手柄
        const resHit = this.findResizeActionHit(pt.x, pt.y);
        if (resHit) {
          const startDist = Math.max(16, Math.hypot(pt.x - resHit.cx, pt.y - resHit.cy));
          this.resizing = {
            pointerId: e.pointerId,
            key: resHit.key,
            cx: resHit.cx,
            cy: resHit.cy,
            startDist
          };
          this.onScaleElement(resHit.key, 1, 'start');
          el.setPointerCapture(e.pointerId);
          return;
        }

        // 1) 點擊已上傳視頻卡片的中央/右上角播放按鈕 -> 切換播放/暫停
        const playHit = this.findPlayHit(pt.x, pt.y);
        if (playHit) {
          this.onToggleCardVideo(playHit.cardId);
          return;
        }

        if (!this.enableDrag) return;

        // 2) 命中畫布元素
        const hit = this.findHitBox(pt.x, pt.y, e.altKey);
        if (!hit) {
          this.uiState.selectedBox = null;
          this.uiState.guides = [];
          this.onSelectElement(null);
          return;
        }

        const state = this.getState();
        const offMap =
          (state.activeWorkspace === 'store-portrait' ? state.portraitOffsets : state.offsets) || {};
        const curOff = offMap[hit.key] || { x: 0, y: 0 };

        const otherBoxes = (this.renderer.hitBoxes || []).filter(
          (b) => b.key !== hit.key && (hit.kind === 'module' ? b.kind === 'module' : b.kind === 'element')
        );

        this.dragging = {
          pointerId: e.pointerId,
          key: hit.key,
          label: hit.label,
          kind: hit.kind,
          hitSnapshot: Object.assign({}, hit),
          startPointerX: pt.x,
          startPointerY: pt.y,
          startOffX: curOff.x || 0,
          startOffY: curOff.y || 0,
          origBox: Object.assign({}, hit),
          otherBoxes,
          moved: false
        };

        this.uiState.selectedBox = hit;
        this.onSelectElement(hit);
        el.setPointerCapture(e.pointerId);
      });

      el.addEventListener('pointermove', (e) => {
        const pt = this.toStageCoords(e.clientX, e.clientY);
        const hovVid = this.findHoveredVideoCardId(pt.x, pt.y);
        this.uiState.hoveredCardId = hovVid ? hovVid.cardId : null;

        if (this.resizing && this.resizing.pointerId === e.pointerId) {
          const curDist = Math.max(8, Math.hypot(pt.x - this.resizing.cx, pt.y - this.resizing.cy));
          const ratio = curDist / this.resizing.startDist;
          this.onScaleElement(this.resizing.key, ratio, 'move');
          const updated = (this.renderer.hitBoxes || []).find((b) => b.key === this.resizing.key);
          if (updated) {
            this.uiState.selectedBox = updated;
          }
          el.style.cursor = 'nwse-resize';
          return;
        }

        if (this.dragging && this.dragging.pointerId === e.pointerId) {
          const rawDX = pt.x - this.dragging.startPointerX;
          const rawDY = pt.y - this.dragging.startPointerY;
          if (Math.hypot(rawDX, rawDY) > 4) {
            this.dragging.moved = true;
          }

          if (!this.dragging.moved) {
            return;
          }

          let nextOffX = Math.round(this.dragging.startOffX + rawDX);
          let nextOffY = Math.round(this.dragging.startOffY + rawDY);
          const guides = [];

          if (this.enableSnap && !e.shiftKey) {
            const ob = this.dragging.origBox;
            const candX = ob.x + (nextOffX - this.dragging.startOffX);
            const candY = ob.y + (nextOffY - this.dragging.startOffY);
            const candBox = {
              x: candX,
              y: candY,
              w: ob.w,
              h: ob.h,
              cx: candX + ob.w / 2,
              cy: candY + ob.h / 2,
              right: candX + ob.w,
              bottom: candY + ob.h
            };

            const snapRes = this.computeSnap(candBox, nextOffX, nextOffY, this.dragging.otherBoxes);
            nextOffX += snapRes.adjustX;
            nextOffY += snapRes.adjustY;
            guides.push(...snapRes.guides);
          }

          this.uiState.guides = guides;
          this.onOffsetChange(this.dragging.key, nextOffX, nextOffY);

          const updated = (this.renderer.hitBoxes || []).find((b) => b.key === this.dragging.key);
          if (updated) {
            this.uiState.selectedBox = updated;
          }
          el.style.cursor = 'grabbing';
          return;
        }

        if (this.findDeleteActionHit(pt.x, pt.y) || this.findPlayHit(pt.x, pt.y)) {
          this.uiState.hoveredBox = null;
          el.style.cursor = 'pointer';
          return;
        }

        if (this.findResizeActionHit(pt.x, pt.y)) {
          this.uiState.hoveredBox = null;
          el.style.cursor = 'nwse-resize';
          return;
        }

        if (this.enableDrag) {
          const hit = this.findHitBox(pt.x, pt.y, e.altKey);
          this.uiState.hoveredBox = hit;
          el.style.cursor = hit ? 'pointer' : 'default';
        } else {
          this.uiState.hoveredBox = null;
          el.style.cursor = 'default';
        }
      });

      const endDrag = (e) => {
        if (this.resizing && this.resizing.pointerId === e.pointerId) {
          const resKey = this.resizing.key;
          this.resizing = null;
          el.style.cursor = 'pointer';
          try {
            el.releasePointerCapture(e.pointerId);
          } catch (_) {}
          this.onScaleElement(resKey, 1, 'end');
          return;
        }
        if (!this.dragging || this.dragging.pointerId !== e.pointerId) return;
        const wasMoved = this.dragging.moved;
        const hitSnap = this.dragging.hitSnapshot;

        this.dragging = null;
        this.uiState.guides = [];
        el.style.cursor = 'pointer';
        try {
          el.releasePointerCapture(e.pointerId);
        } catch (_) {}

        // 若是直接點擊（未拖動），觸發就地改字或直接彈出圖片/影片上傳框！
        if (!wasMoved && hitSnap && e.type === 'pointerup') {
          this.onDirectClickElement(hitSnap, e.clientX, e.clientY);
        }
      };

      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);

      el.addEventListener('pointerleave', () => {
        if (!this.dragging) {
          this.uiState.hoveredBox = null;
          this.uiState.hoveredCardId = null;
        }
      });

      // 支持從電腦文件夾直接拖拽圖片/MP4 到畫布任意圖標、頭像或視頻卡片上完成上傳！
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        const pt = this.toStageCoords(e.clientX, e.clientY);
        const hit = this.findHitBox(pt.x, pt.y, false);
        this.uiState.hoveredBox = hit;
      });

      el.addEventListener('dragleave', () => {
        this.uiState.hoveredBox = null;
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        const pt = this.toStageCoords(e.clientX, e.clientY);
        const hit = this.findHitBox(pt.x, pt.y, false);
        this.onDropFileOnElement(hit, file);
      });

      // 鍵盤方向鍵微調 + Delete/Backspace 一鍵隱藏刪除選中元素
      window.addEventListener('keydown', (e) => {
        if (!this.uiState.selectedBox) return;
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        const sel = this.uiState.selectedBox;

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          this.uiState.selectedBox = null;
          this.uiState.guides = [];
          this.onHideElement(sel.key, sel.label);
          return;
        }

        const step = e.shiftKey ? 10 : 1;
        const key = sel.key;
        const state = this.getState();
        const offMap =
          (state.activeWorkspace === 'store-portrait' ? state.portraitOffsets : state.offsets) || {};
        const cur = offMap[key] || { x: 0, y: 0 };

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.onOffsetChange(key, cur.x - step, cur.y);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.onOffsetChange(key, cur.x + step, cur.y);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.onOffsetChange(key, cur.x, cur.y - step);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.onOffsetChange(key, cur.x, cur.y + step);
        } else if (e.key === 'Escape') {
          this.uiState.selectedBox = null;
          this.uiState.guides = [];
          this.onSelectElement(null);
        }
        const updated = (this.renderer.hitBoxes || []).find((b) => b.key === key);
        if (updated) this.uiState.selectedBox = updated;
      });
    }

    computeSnap(candBox, nextOffX, nextOffY, otherBoxes) {
      const W = this.W;
      const H = this.H;
      let adjustX = 0;
      let adjustY = 0;
      let bestDX = SNAP_THRESHOLD + 1;
      let bestDY = SNAP_THRESHOLD + 1;
      let snapGuideX = null;
      let snapGuideY = null;

      if (Math.abs(nextOffX) <= SNAP_THRESHOLD) {
        bestDX = Math.abs(nextOffX);
        adjustX = -nextOffX;
        snapGuideX = { axis: 'x', pos: candBox.cx + adjustX, label: '初始水平基准', primary: true };
      }
      if (Math.abs(nextOffY) <= SNAP_THRESHOLD) {
        bestDY = Math.abs(nextOffY);
        adjustY = -nextOffY;
        snapGuideY = { axis: 'y', pos: candBox.cy + adjustY, label: '初始垂直基准', primary: true };
      }

      const stageXTargets = [
        { pos: Math.round(W / 2), label: `画布水平中线 (${Math.round(W / 2)})` },
        { pos: 48, label: '左安全边线' },
        { pos: W - 48, label: '右安全边线' }
      ];
      stageXTargets.forEach((t) => {
        const checks = [
          { val: candBox.cx, tag: t.label },
          { val: candBox.x, tag: t.label },
          { val: candBox.right, tag: t.label }
        ];
        checks.forEach((c) => {
          const diff = t.pos - c.val;
          if (Math.abs(diff) < bestDX) {
            bestDX = Math.abs(diff);
            adjustX = Math.round(diff);
            snapGuideX = { axis: 'x', pos: t.pos, label: c.tag, primary: true };
          }
        });
      });

      const diffMidY = Math.round(H / 2) - candBox.cy;
      if (Math.abs(diffMidY) < bestDY) {
        bestDY = Math.abs(diffMidY);
        adjustY = Math.round(diffMidY);
        snapGuideY = { axis: 'y', pos: Math.round(H / 2), label: `画布垂直中线 (${Math.round(H / 2)})`, primary: true };
      }

      otherBoxes.forEach((ob) => {
        const xPairs = [
          [candBox.x, ob.x, '左边缘对齐'],
          [candBox.cx, ob.cx, '水平中心对齐'],
          [candBox.right, ob.right, '右边缘对齐']
        ];
        xPairs.forEach(([cv, tv, lbl]) => {
          const d = tv - cv;
          if (Math.abs(d) < bestDX) {
            bestDX = Math.abs(d);
            adjustX = Math.round(d);
            snapGuideX = { axis: 'x', pos: tv, label: lbl, primary: false };
          }
        });

        const yPairs = [
          [candBox.y, ob.y, '顶部对齐'],
          [candBox.cy, ob.cy, '垂直中心对齐'],
          [candBox.bottom, ob.bottom, '底部对齐']
        ];
        yPairs.forEach(([cv, tv, lbl]) => {
          const d = tv - cv;
          if (Math.abs(d) < bestDY) {
            bestDY = Math.abs(d);
            adjustY = Math.round(d);
            snapGuideY = { axis: 'y', pos: tv, label: lbl, primary: false };
          }
        });
      });

      const guides = [];
      if (snapGuideX) guides.push(snapGuideX);
      if (snapGuideY) guides.push(snapGuideY);
      return { adjustX, adjustY, guides };
    }
  }

  global.StageInteraction = StageInteraction;
})(window);
