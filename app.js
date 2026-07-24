/**
 * Application Controller for ChronoGammon.
 * Coordinates the UI, Board renderer, Game Logic, 3D Dice, and Audio modules.
 * Integrates WebSockets for real-time online multiplayer.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize core game components
    const game = new BackgammonGame();
    let dice3d = null;
    let socket = null;

    // Cache DOM Elements
    const boardEl = document.getElementById('game-board');
    const btnRoll = document.getElementById('btn-roll');
    const btnUndo = document.getElementById('btn-undo');
    const btnEndTurn = document.getElementById('btn-end-turn');
    const btnSettings = document.getElementById('btn-settings');
    const statusBannerEl = document.getElementById('status-banner');
    
    // HUD Stats
    const p1ScoreEl = document.getElementById('p1-score');
    const p2ScoreEl = document.getElementById('p2-score');
    const p1StatusEl = document.getElementById('p1-status');
    const p2StatusEl = document.getElementById('p2-status');
    const p1NameEl = document.getElementById('p1-name');
    const p2NameEl = document.getElementById('p2-name');

    // Victory Modal & Match Score Controls
    const modalVictory = document.getElementById('modal-victory');
    const victoryTitle = document.getElementById('victory-title');
    const victorySubtitle = document.getElementById('victory-subtitle');
    const victoryDesc = document.getElementById('victory-desc');
    const vScoreP1 = document.getElementById('v-score-p1');
    const vScoreP2 = document.getElementById('v-score-p2');
    const vP2Name = document.getElementById('v-p2-name');
    const btnVictoryRematch = document.getElementById('btn-victory-rematch');
    const btnVictoryClose = document.getElementById('btn-victory-close');
    const btnResetScore = document.getElementById('btn-reset-score');

    // Multiplayer Sidebar Panel
    const onlineLobbyPanel = document.getElementById('online-lobby-panel');
    const roomCodeDisplay = document.getElementById('room-code-display');

    // Modals
    const modalSettings = document.getElementById('modal-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const closeSettings = document.getElementById('close-settings');
    const btnFullscreen = document.getElementById('btn-fullscreen');

    // Settings Inputs
    const checkAudio = document.getElementById('check-audio');
    const checkWakeLock = document.getElementById('check-wake-lock');
    const aiDifficultyRow = document.getElementById('ai-difficulty-row');
    const onlineSetupRow = document.getElementById('online-setup-row');
    const joinRoomCodeInput = document.getElementById('join-room-code');
    const btnCreateLobby = document.getElementById('btn-create-lobby');
    const btnJoinLobby = document.getElementById('btn-join-lobby');

    function toggleFullscreen() {
        const doc = window.document;
        const docEl = doc.documentElement;

        const requestFS = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
        const cancelFS = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

        if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
            if (requestFS) {
                requestFS.call(docEl).catch(err => console.log('Fullscreen rejected:', err));
            }
        } else {
            if (cancelFS) {
                cancelFS.call(doc);
            }
        }
    }

    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', toggleFullscreen);
    }

    function updateFullscreenIcons() {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (btnFullscreen) {
            const fsOpen = btnFullscreen.querySelector('.fs-open');
            const fsClose = btnFullscreen.querySelector('.fs-close');
            if (fsOpen && fsClose) {
                fsOpen.style.display = isFS ? 'none' : 'block';
                fsClose.style.display = isFS ? 'block' : 'none';
            }
        }
    }

    document.addEventListener('fullscreenchange', updateFullscreenIcons);
    document.addEventListener('webkitfullscreenchange', updateFullscreenIcons);

    // Initialize 3D dice once window is ready to measure container size properly
    setTimeout(() => {
        dice3d = new Dice3D(document.getElementById('dice-3d-container'));
    }, 100);

    window.addEventListener('resize', () => {
        if (dice3d) dice3d.onResize();
    });
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (dice3d) dice3d.onResize();
        }, 200);
    });

    // =========================================================================
    // ========================= BOARD CREATION ================================
    // =========================================================================

    /**
     * Dynamically constructs the Backgammon Board Grid structure.
     */
    function buildBoardGrid() {
        boardEl.innerHTML = '';

        // --- ROW 1 (TOP HALF of board: points 13 to 18, Bar, points 19 to 24, Bear off P2) ---
        // Left Quadrant: points 13 to 18
        for (let p = 13; p <= 18; p++) {
            createPointElement(p, 'top');
        }

        // Center Column: Bar Divider (Col 7, spans 2 rows)
        const barDivider = document.createElement('div');
        barDivider.className = 'bar-divider';
        barDivider.id = 'bar-divider';
        
        // P1 (Red) Bar Zone (Top)
        const barP1 = document.createElement('div');
        barP1.className = 'bar-zone top-bar';
        barP1.id = 'bar-p1';
        barP1.dataset.point = 'bar1';
        barDivider.appendChild(barP1);

        // P2 (White) Bar Zone (Bottom)
        const barP2 = document.createElement('div');
        barP2.className = 'bar-zone bottom-bar';
        barP2.id = 'bar-p2';
        barP2.dataset.point = 'bar2';
        barDivider.appendChild(barP2);

        boardEl.appendChild(barDivider);

        // Right Quadrant: points 19 to 24
        for (let p = 19; p <= 24; p++) {
            createPointElement(p, 'top');
        }

        // Right Column: Bear off Divider (Col 14, spans 2 rows)
        const bearOffDivider = document.createElement('div');
        bearOffDivider.className = 'bear-off-divider';
        
        // P2 Bear Off Tray (Top)
        const bearP2 = document.createElement('div');
        bearP2.className = 'bear-off-zone top-bear';
        bearP2.id = 'bear-p2';
        bearP2.dataset.point = '25'; // Target for Player 2 bearing off
        bearOffDivider.appendChild(bearP2);

        // P1 Bear Off Tray (Bottom)
        const bearP1 = document.createElement('div');
        bearP1.className = 'bear-off-zone bottom-bear';
        bearP1.id = 'bear-p1';
        bearP1.dataset.point = '0'; // Target for Player 1 bearing off
        bearOffDivider.appendChild(bearP1);

        boardEl.appendChild(bearOffDivider);

        // --- ROW 2 (BOTTOM HALF of board: points 12 to 7, points 6 to 1) ---
        // Left Quadrant: points 12 to 7
        for (let p = 12; p >= 7; p--) {
            createPointElement(p, 'bottom');
        }

        // Right Quadrant: points 6 to 1
        for (let p = 6; p >= 1; p--) {
            createPointElement(p, 'bottom');
        }
    }

    /**
     * Helper to create a point triangle and append it.
     */
    function createPointElement(p, orientation) {
        const pointEl = document.createElement('div');
        const oddEven = (p % 2 === 0) ? 'even' : 'odd';
        pointEl.className = `point ${orientation} ${oddEven}`;
        pointEl.id = `point-${p}`;
        pointEl.dataset.point = p;

        const checkersContainer = document.createElement('div');
        checkersContainer.className = 'point-checkers';
        pointEl.appendChild(checkersContainer);

        // Grid column placements to respect the Bar (col 7) and Bear-off (col 14)
        let col = 1;
        if (orientation === 'top') {
            col = (p <= 18) ? (p - 12) : (p - 11);
        } else {
            col = (p >= 7) ? (13 - p) : (14 - p);
        }
        pointEl.style.gridColumn = col;
        pointEl.style.gridRow = (orientation === 'top') ? 1 : 2;

        pointEl.addEventListener('click', () => handlePointClick(p));

        boardEl.appendChild(pointEl);
    }

    // =========================================================================
    // =========================== RENDERING ===================================
    // =========================================================================

    /**
     * Renders the checkers and active statuses on the board.
     */
    function renderBoard() {
        const isFlipped = (game.gameMode === 'online' && game.myPlayerId === 2);

        // 1. Render checkers on points 1 to 24
        for (let p = 1; p <= 24; p++) {
            const internalP = isFlipped ? (25 - p) : p;
            const point = game.board[internalP];
            const pointEl = document.getElementById(`point-${p}`);
            if (!pointEl) continue;

            const checkersContainer = pointEl.querySelector('.point-checkers');
            checkersContainer.innerHTML = '';

            const isSelectable = isPointSelectable(internalP);
            const isSelected = game.selectedPoint === internalP;

            if (game.validMoves.includes(internalP)) {
                pointEl.classList.add('valid-target');
            } else {
                pointEl.classList.remove('valid-target');
            }

            if (isSelected) {
                pointEl.classList.add('selected');
            } else {
                pointEl.classList.remove('selected');
            }

            const count = point.count;
            const isTop = pointEl.classList.contains('top');
            const spacing = count > 1 ? Math.min(18, 70 / (count - 1)) : 0;

            for (let i = 0; i < count; i++) {
                const checker = document.createElement('div');
                checker.className = `checker p${point.player}`;

                if (i === count - 1) {
                    if (isSelectable) checker.classList.add('selectable');
                    if (isSelected) checker.classList.add('selected');
                }

                checker.style.position = 'absolute';
                if (isTop) {
                    checker.style.top = `${i * spacing}%`;
                } else {
                    checker.style.bottom = `${i * spacing}%`;
                }

                checkersContainer.appendChild(checker);
            }
        }

        // 2. Render Bar Checkers
        const barP1 = document.getElementById('bar-p1');
        const barP2 = document.getElementById('bar-p2');
        if (isFlipped) {
            renderBarZone(barP1, 2); // Bottom bar renders P2 (Me)
            renderBarZone(barP2, 1); // Top bar renders P1 (Opponent)
        } else {
            renderBarZone(barP1, 1); // Bottom bar renders P1
            renderBarZone(barP2, 2); // Top bar renders P2
        }

        // 3. Render Bear Off Trays
        const bearP1 = document.querySelector('.bottom-bear');
        const bearP2 = document.querySelector('.top-bear');
        if (isFlipped) {
            renderBearOffZone(bearP1, 2, 25); // Bottom tray renders P2 (internal target 25)
            renderBearOffZone(bearP2, 1, 0);  // Top tray renders P1 (internal target 0)
        } else {
            renderBearOffZone(bearP1, 1, 0);  // Bottom tray renders P1 (internal target 0)
            renderBearOffZone(bearP2, 2, 25); // Top tray renders P2 (internal target 25)
        }

        // 4. Check for victory / Game Over
        const winner = game.checkWin();
        if (winner !== 0 || game.isGameOver) {
            triggerVictoryModal(game.winner || winner);
        }

        // 5. Update HUD & Buttons
        updateHud();
        updateButtons();
    }

    /**
     * Shows the Victory Celebration modal popup.
     */
    function triggerVictoryModal(winner) {
        if (!modalVictory) return;

        const isGammon = (game.winType === 'gammon');
        const winnerName = (winner === 1) ? 'Player 1' : (game.gameMode === 'vsAI' ? 'AI Opponent' : 'Player 2');
        const loserName = (winner === 1) ? (game.gameMode === 'vsAI' ? 'AI Opponent' : 'Player 2') : 'Player 1';

        if (victoryTitle) victoryTitle.textContent = `🎉 ${winnerName} Wins!`;
        if (victorySubtitle) {
            victorySubtitle.textContent = isGammon ? '🏆 GAMMON VICTORY (+2 Points)' : '⭐️ SINGLE WIN (+1 Point)';
        }
        if (victoryDesc) {
            victoryDesc.textContent = isGammon 
                ? `${loserName} had 0 checkers borne off!` 
                : `${winnerName} borne off all 15 checkers!`;
        }

        if (vScoreP1) vScoreP1.textContent = game.scores[1];
        if (vScoreP2) vScoreP2.textContent = game.scores[2];
        if (vP2Name) vP2Name.textContent = (game.gameMode === 'vsAI' ? 'AI Opponent' : 'Player 2');

        modalVictory.classList.add('active');
    }

    /**
     * Helper to render checkers inside the Bar Zone.
     */
    function renderBarZone(barEl, player) {
        barEl.innerHTML = '';
        const count = game.bar[player];
        
        let isSelectable = false;
        if (game.gameMode === 'online') {
            isSelectable = (game.turn === player && player === game.myPlayerId && count > 0 && game.remainingMoves.length > 0 && !game.isGameOver);
        } else {
            isSelectable = (game.turn === player && count > 0 && game.remainingMoves.length > 0 && !game.isAiThinking && !game.isGameOver);
        }

        const isSelected = game.selectedPoint === "bar";

        if (isSelected) barEl.classList.add('selected');
        else barEl.classList.remove('selected');

        const isTop = barEl.classList.contains('top-bar');
        const spacing = count > 1 ? Math.min(18, 65 / (count - 1)) : 0;

        for (let i = 0; i < count; i++) {
            const checker = document.createElement('div');
            checker.className = `checker p${player}`;
            
            if (i === count - 1) {
                if (isSelectable) checker.classList.add('selectable');
                if (isSelected) checker.classList.add('selected');
            }

            checker.style.position = 'absolute';
            if (isTop) {
                checker.style.top = `${i * spacing}%`;
            } else {
                checker.style.bottom = `${i * spacing}%`;
            }

            barEl.appendChild(checker);
        }

        barEl.onclick = (e) => {
            e.stopPropagation();
            if (isSelectable && !game.isGameOver) {
                game.selectedPoint = "bar";
                game.validMoves = game.getValidMovesForPoint("bar");
                renderBoard();
            }
        };
    }

    /**
     * Helper to render borne-off chips in the Bear Off Tray.
     */
    function renderBearOffZone(bearEl, player, targetVal) {
        bearEl.innerHTML = '';
        const count = game.borneOff[player];
        const isValidTarget = game.validMoves.includes(targetVal) && !game.isGameOver;

        if (isValidTarget) {
            bearEl.classList.add('valid-target');
            bearEl.onclick = () => {
                if (game.selectedPoint !== -1 && !game.isGameOver) {
                    game.makeMove(game.selectedPoint, targetVal);
                    renderBoard();
                }
            };
        } else {
            bearEl.classList.remove('valid-target');
            bearEl.onclick = null;
        }

        for (let i = 0; i < count; i++) {
            const chip = document.createElement('div');
            chip.className = `bear-off-chip p${player}`;
            bearEl.appendChild(chip);
        }
    }

    /**
     * Update Scoreboards, Match Scores.
     */
    function updateHud() {
        if (p1ScoreEl) p1ScoreEl.textContent = `${game.scores[1]} pts`;
        if (p2ScoreEl) p2ScoreEl.textContent = `${game.scores[2]} pts`;

        if (game.turn === 1) {
            if (p1StatusEl) p1StatusEl.classList.add('active');
            if (p2StatusEl) p2StatusEl.classList.remove('active');
        } else {
            if (p1StatusEl) p1StatusEl.classList.remove('active');
            if (p2StatusEl) p2StatusEl.classList.add('active');
        }

        if (statusBannerEl) statusBannerEl.textContent = game.statusMessage;
    }

    /**
     * Enables, disables, and toggles visibility of contextual buttons based on game state.
     */
    function updateButtons() {
        if (game.isGameOver) {
            btnRoll.classList.remove('visible');
            btnRoll.disabled = true;
            btnUndo.classList.remove('visible');
            btnUndo.disabled = true;
            btnEndTurn.classList.remove('visible');
            btnEndTurn.disabled = true;
            return;
        }

        if (game.isOpeningRollPhase) {
            let isAllowed = true;
            if (game.gameMode === 'vsAI' && game.openingRollTurn === 2) {
                isAllowed = false;
            } else if (game.gameMode === 'online' && game.openingRollTurn !== game.myPlayerId) {
                isAllowed = false;
            }

            if (isAllowed) {
                btnRoll.classList.add('visible');
                btnRoll.disabled = false;
            } else {
                btnRoll.classList.remove('visible');
                btnRoll.disabled = true;
            }
            btnUndo.classList.remove('visible');
            btnEndTurn.classList.remove('visible');
            return;
        }

        const rolled = game.dice.length > 0;
        const movesLeft = game.remainingMoves.length > 0;
        
        const activePlayerIsAi = (game.turn === 2 && game.gameMode === 'vsAI');
        const isOnline = (game.gameMode === 'online');
        const isMyOnlineTurn = isOnline && (game.turn === game.myPlayerId);

        const isHumanTurn = !activePlayerIsAi && (!isOnline || isMyOnlineTurn);

        if (!isHumanTurn) {
            btnRoll.classList.remove('visible');
            btnUndo.classList.remove('visible');
            btnEndTurn.classList.remove('visible');
            return;
        }

        if (!rolled) {
            btnRoll.classList.add('visible');
            btnRoll.disabled = false;
            
            btnUndo.classList.remove('visible');
            btnEndTurn.classList.remove('visible');
        } else {
            btnRoll.classList.remove('visible');
            btnRoll.disabled = true;

            const canUndo = game.history.length > 0;
            if (canUndo) {
                btnUndo.classList.add('visible');
                btnUndo.disabled = false;
            } else {
                btnUndo.classList.remove('visible');
                btnUndo.disabled = true;
            }

            const canEndTurn = !movesLeft || !game.hasLegalMoves();
            if (canEndTurn) {
                btnEndTurn.classList.add('visible');
                btnEndTurn.disabled = false;
            } else {
                btnEndTurn.classList.remove('visible');
                btnEndTurn.disabled = true;
            }
        }
    }

    // =========================================================================
    // ======================== USER INTERACTIONS ==============================
    // =========================================================================

    /**
     * Determines selectable points for checkers on the board.
     */
    function isPointSelectable(p) {
        if (game.isAiThinking) return false;
        if (game.remainingMoves.length === 0) return false;
        
        if (game.gameMode === 'vsAI' && game.turn === 2) return false;

        // If online mode, check if turn is mine and point belongs to me
        if (game.gameMode === 'online') {
            if (game.turn !== game.myPlayerId) return false;
            if (game.board[p].player !== game.myPlayerId) return false;
        }

        if (game.bar[game.turn] > 0) return false;

        return (game.board[p].player === game.turn && game.getValidMovesForPoint(p).length > 0);
    }

    /**
     * Clicking a board point. Handles checker selection, movement execution.
     */
    function handlePointClick(p) {
        if (game.isAiThinking) return;

        const isFlipped = (game.gameMode === 'online' && game.myPlayerId === 2);
        const internalP = isFlipped ? (25 - p) : p;

        // 1. Move Execution
        if (game.selectedPoint !== -1 && game.validMoves.includes(internalP)) {
            game.makeMove(game.selectedPoint, internalP);
            renderBoard();
            return;
        }

        // 2. Select Point
        if (isPointSelectable(internalP)) {
            game.selectedPoint = internalP;
            game.validMoves = game.getValidMovesForPoint(internalP);
            renderBoard();
        } else {
            // Deselect
            game.selectedPoint = -1;
            game.validMoves = [];
            renderBoard();
        }
    }

    /**
     * Triggered on Dice Roll button click.
     */
    function triggerPlayerRoll() {
        if (game.isAiThinking) return;
        if (!game.isOpeningRollPhase && game.dice.length > 0) return;

        if (game.gameMode === 'online') {
            if (!game.isOpeningRollPhase && game.turn !== game.myPlayerId) return;
            if (game.isOpeningRollPhase && game.openingRollTurn !== game.myPlayerId) return;
            sendSocketMessage('roll-dice');
            btnRoll.disabled = true;
            btnRoll.classList.remove('visible');
            return;
        }

        // Local & AI Modes
        const wasOpening = game.isOpeningRollPhase;
        const roll = game.generateRoll();
        btnRoll.disabled = true;
        btnRoll.classList.remove('visible');

        let activeDieIdx = null;
        if (wasOpening) {
            activeDieIdx = roll[1] === null ? 0 : 1;
        }

        if (dice3d) {
            dice3d.roll(roll[0], roll[1], () => {
                renderBoard();

                if (wasOpening) {
                    if (game.isOpeningRollPhase) {
                        // Tie or waiting for next roll
                        updateHud();
                        updateButtons();
                        // If VS AI mode and P2 (AI) turn to roll:
                        if (game.gameMode === 'vsAI' && game.openingRollTurn === 2) {
                            setTimeout(() => {
                                triggerPlayerRoll();
                            }, 1000);
                        }
                        return;
                    } else {
                        // Opening roll completed, turn determined!
                        if (game.gameMode === 'vsAI' && game.turn === 2) {
                            game.statusMessage = "AI Opponent is thinking...";
                            updateHud();
                            updateButtons();
                            setTimeout(() => {
                                game.triggerAiMove(
                                    () => renderBoard(),
                                    () => {
                                        setTimeout(() => {
                                            game.switchTurn();
                                            renderBoard();
                                        }, 1000);
                                    }
                                );
                            }, 500);
                            return;
                        }
                    }
                }

                if (!game.isOpeningRollPhase && !game.hasLegalMoves()) {
                    game.statusMessage = `P${game.turn} has no legal moves! Press End Turn.`;
                    updateHud();
                    updateButtons();
                }
            }, activeDieIdx);
        } else {
            renderBoard();
            if (wasOpening) {
                if (game.isOpeningRollPhase) {
                    if (game.gameMode === 'vsAI' && game.openingRollTurn === 2) {
                        triggerPlayerRoll();
                    }
                } else if (game.gameMode === 'vsAI' && game.turn === 2) {
                    game.triggerAiMove(
                        () => renderBoard(),
                        () => {
                            game.switchTurn();
                            renderBoard();
                        }
                    );
                }
            }
        }
    }

    /**
     * Ends the current turn and hands over play.
     */
    function handleEndTurn() {
        if (game.gameMode === 'online') {
            if (game.turn !== game.myPlayerId) return;
            sendSocketMessage('end-turn');
            btnRoll.disabled = true;
            btnEndTurn.disabled = true;
            btnUndo.disabled = true;
            return;
        }

        game.switchTurn();
        renderBoard();

        if (game.gameMode === 'vsAI' && game.turn === 2) {
            triggerAiTurn();
        }
    }

    /**
     * AI Turn automation sequence.
     */
    function triggerAiTurn() {
        game.statusMessage = "AI Opponent is thinking...";
        updateHud();
        updateButtons();

        setTimeout(() => {
            const roll = game.generateRoll();
            if (dice3d) {
                dice3d.roll(roll[0], roll[1], () => {
                    renderBoard();

                    game.triggerAiMove(
                        () => renderBoard(),
                        () => {
                            setTimeout(() => {
                                game.switchTurn();
                                renderBoard();
                            }, 1000);
                        }
                    );
                });
            } else {
                game.triggerAiMove(
                    () => renderBoard(),
                    () => {
                        game.switchTurn();
                        renderBoard();
                    }
                );
            }
        }, 1000);
    }

    // =========================================================================
    // ====================== NETWORK SYNC HOOKS ===============================
    // =========================================================================

    /**
     * Establish WebSocket client connection to the static hosting server.
     */
    function connectWebSocket() {
        if (window.location.protocol === 'file:') {
            game.statusMessage = "Online mode requires running the Node server. Open http://localhost:3000";
            statusBannerEl.textContent = game.statusMessage;
            alert("Online mode requires a local server. Please run 'npm start' and open http://localhost:3000 in your browser.");
            
            // Revert game mode selection to vsAI in settings
            const modeAiBtn = document.getElementById('mode-ai');
            const modeOnlineBtn = document.getElementById('mode-online');
            if (modeAiBtn && modeOnlineBtn) {
                modeOnlineBtn.classList.remove('selected');
                modeAiBtn.classList.add('selected');
                onlineSetupRow.style.display = 'none';
                aiDifficultyRow.style.display = 'flex';
            }
            return;
        }

        if (socket && socket.readyState === WebSocket.OPEN) return;
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        game.statusMessage = "Connecting to server...";
        statusBannerEl.textContent = game.statusMessage;

        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            console.log("WebSocket connected.");
            game.statusMessage = "Connected. Create or Join a Room to play!";
            statusBannerEl.textContent = game.statusMessage;
        };
        
        socket.onmessage = (event) => {
            try {
                const { type, data } = JSON.parse(event.data);
                handleServerMessage(type, data);
            } catch (e) {
                console.error("Error parsing socket data:", e);
            }
        };
        
        socket.onclose = () => {
            console.log("WebSocket connection closed.");
            if (game.gameMode === 'online') {
                game.statusMessage = "Server connection lost. Try connecting again.";
                statusBannerEl.textContent = game.statusMessage;
                onlineLobbyPanel.style.display = 'none';
                modalSettings.classList.add('active');
            }
        };

        socket.onerror = (err) => {
            console.error("WebSocket client error:", err);
        };
    }

    /**
     * Sends message packet to WebSocket.
     */
    function sendSocketMessage(type, data = {}) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type, data }));
        } else {
            console.warn("Socket is not open. Action aborted.");
        }
    }

    /**
     * Handle incoming WebSocket events from server.
     */
    function handleServerMessage(type, data) {
        switch (type) {
            case 'room-created': {
                game.myPlayerId = 1;
                roomCodeDisplay.textContent = data.code;
                onlineLobbyPanel.style.display = 'flex';
                game.statusMessage = `Lobby created! Share Room Code: ${data.code}`;
                statusBannerEl.textContent = game.statusMessage;
                
                modalSettings.classList.remove('active');
                break;
            }

            case 'room-joined': {
                game.myPlayerId = 2;
                roomCodeDisplay.textContent = data.code;
                onlineLobbyPanel.style.display = 'flex';
                game.statusMessage = `Joined Room: ${data.code}. Waiting for host to start...`;
                statusBannerEl.textContent = game.statusMessage;
                
                modalSettings.classList.remove('active');
                break;
            }

            case 'game-start': {
                game.gameMode = 'online';
                game.resetGame();
                
                if (game.myPlayerId === 1) {
                    document.querySelector('.player-indicator.p1 .name').textContent = "You (Red)";
                    document.querySelector('.player-indicator.p2 .name').textContent = "Opponent (White)";
                } else {
                    document.querySelector('.player-indicator.p1 .name').textContent = "Opponent (Red)";
                    document.querySelector('.player-indicator.p2 .name').textContent = "You (White)";
                }
                
                buildBoardGrid();
                renderBoard();
                
                game.statusMessage = "Opponent connected. Game started! P1's Turn.";
                statusBannerEl.textContent = game.statusMessage;
                break;
            }

            case 'opening-roll-first': {
                game.isOpeningRollPhase = true;
                game.openingRolls[1] = data.val;
                game.openingRollTurn = 2;
                game.dice = [data.val, 0];
                game.statusMessage = `Player 1 rolled ${data.val}. Player 2: Roll your starting die!`;
                statusBannerEl.textContent = game.statusMessage;

                if (dice3d) {
                    dice3d.roll(data.val, null, () => {
                        renderBoard();
                        updateHud();
                        updateButtons();
                    }, 0);
                } else {
                    renderBoard();
                    updateHud();
                    updateButtons();
                }
                break;
            }

            case 'opening-roll-tie': {
                game.isOpeningRollPhase = true;
                game.openingRolls = { 1: null, 2: null };
                game.openingRollTurn = 1;
                game.dice = [game.dice[0], data.val];
                game.statusMessage = `Tie (both rolled ${data.val})! Player 1: Roll again.`;
                statusBannerEl.textContent = game.statusMessage;

                if (dice3d) {
                    dice3d.roll(null, data.val, () => {
                        renderBoard();
                        updateHud();
                        updateButtons();
                    }, 1);
                } else {
                    renderBoard();
                    updateHud();
                    updateButtons();
                }
                break;
            }

            case 'opening-roll-completed': {
                game.isOpeningRollPhase = false;
                game.dice = data.dice;
                game.remainingMoves = data.remaining;
                game.turn = data.turn;
                
                game.statusMessage = `P1 rolled ${game.dice[0]}, P2 rolled ${game.dice[1]}. P${game.turn} goes first!`;
                statusBannerEl.textContent = game.statusMessage;

                if (dice3d) {
                    dice3d.roll(null, data.val, () => {
                        renderBoard();
                        updateHud();
                        updateButtons();
                    }, 1);
                } else {
                    renderBoard();
                    updateHud();
                    updateButtons();
                }
                break;
            }

            case 'dice-rolled': {
                game.dice = data.dice;
                game.remainingMoves = data.remaining;
                game.turn = data.turn;
                
                const rollerName = (game.turn === game.myPlayerId) ? "You" : "Opponent";
                game.statusMessage = `${rollerName} rolled: ${game.dice.join(', ')}`;
                statusBannerEl.textContent = game.statusMessage;

                if (dice3d) {
                    dice3d.roll(game.dice[0], game.dice[1], () => {
                        game.updateStatusAfterRoll();
                        renderBoard();
                    });
                } else {
                    game.updateStatusAfterRoll();
                    renderBoard();
                }
                break;
            }

            case 'move-executed': {
                // Execute move remotely (isRemote = true)
                game.makeMove(data.from, data.to, true, data.usedDie);
                renderBoard();
                updateHud();
                updateButtons();
                break;
            }

            case 'move-undone': {
                game.undoMove(true, data.die);
                renderBoard();
                updateHud();
                updateButtons();
                break;
            }

            case 'turn-changed': {
                game.turn = data.turn;
                game.dice = [];
                game.remainingMoves = [];
                game.history = [];
                
                const turnName = (game.turn === game.myPlayerId) ? "Your" : "Opponent's";
                game.statusMessage = `${turnName} turn.`;
                statusBannerEl.textContent = game.statusMessage;
                renderBoard();
                break;
            }

            case 'opponent-disconnected': {
                game.statusMessage = "Opponent disconnected. Room closed.";
                statusBannerEl.textContent = game.statusMessage;
                onlineLobbyPanel.style.display = 'none';
                alert("Your opponent disconnected. The online game has ended.");
                
                // Restore defaults
                document.querySelector('.player-indicator.p1 .name').textContent = "Player 1 (Red)";
                document.querySelector('.player-indicator.p2 .name').textContent = "AI Opponent (White)";
                
                game.gameMode = 'vsAI';
                game.resetGame();
                buildBoardGrid();
                renderBoard();
                break;
            }

            case 'error': {
                alert(data.message);
                break;
            }
        }
    }

    // Set game local network triggers to pass events out
    game.onLocalMovePlayed = (from, to, usedDie) => {
        sendSocketMessage('make-move', { from, to, usedDie });
    };

    game.onLocalUndoPlayed = (die) => {
        sendSocketMessage('undo-move', { die });
    };

    // =========================================================================
    // ==================== SCREEN WAKE LOCK (KEEP SCREEN ON) ==================
    // =========================================================================

    let wakeLock = null;
    let keepAwakeEnabled = true;
    let wakeLockRequestInProgress = false;

    async function enableWakeLock() {
        keepAwakeEnabled = true;
        if (checkWakeLock) checkWakeLock.checked = true;

        if (wakeLock || wakeLockRequestInProgress) return;
        if (!('wakeLock' in navigator)) return;

        try {
            wakeLockRequestInProgress = true;
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock active.');

            wakeLock.addEventListener('release', () => {
                wakeLock = null;
                console.log('Screen Wake Lock released.');

                if (keepAwakeEnabled && document.visibilityState === 'visible') {
                    setTimeout(enableWakeLock, 250);
                }
            });
        } catch (err) {
            console.warn('Screen Wake Lock request failed:', err);
        } finally {
            wakeLockRequestInProgress = false;
        }
    }

    async function disableWakeLock() {
        keepAwakeEnabled = false;

        if (wakeLock) {
            try {
                await wakeLock.release();
            } catch (err) {
                console.warn('Screen Wake Lock release failed:', err);
            }
            wakeLock = null;
        }

        if (checkWakeLock) checkWakeLock.checked = false;
    }

    if (checkWakeLock) {
        checkWakeLock.checked = true;
        checkWakeLock.addEventListener('change', () => {
            if (checkWakeLock.checked) {
                enableWakeLock();
            } else {
                disableWakeLock();
            }
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (keepAwakeEnabled && document.visibilityState === 'visible' && !wakeLock) {
            enableWakeLock();
        }
    });

    document.addEventListener('pointerdown', () => {
        if (keepAwakeEnabled && checkWakeLock && checkWakeLock.checked) {
            enableWakeLock();
        }
    }, { passive: true });

    document.addEventListener('keydown', () => {
        if (keepAwakeEnabled && checkWakeLock && checkWakeLock.checked) {
            enableWakeLock();
        }
    });

    enableWakeLock();

    // =========================================================================
    // ==================== SETTINGS & THEMES ==================================
    // =========================================================================

    /**
     * Updates theme attributes and tells Three.js dice renderer to swap colors.
     */
    function applyTheme(themeValue) {
        if (!themeValue) return;
        document.documentElement.setAttribute('data-theme', themeValue);
        
        if (dice3d && typeof dice3d.setTheme === 'function') {
            dice3d.setTheme(themeValue);
        }

        // Dynamically update player labels to match theme checker colors
        const mode = game ? game.gameMode : 'vsAI';
        if (themeValue === 'classic') {
            if (p1NameEl) p1NameEl.textContent = 'Player 1 (Black)';
            if (p2NameEl) p2NameEl.textContent = mode === 'vsAI' ? 'AI Opponent (White)' : 'Player 2 (White)';
        } else if (themeValue === 'cyberpunk') {
            if (p1NameEl) p1NameEl.textContent = 'Player 1 (Pink)';
            if (p2NameEl) p2NameEl.textContent = mode === 'vsAI' ? 'AI Opponent (Cyan)' : 'Player 2 (Cyan)';
        } else {
            if (p1NameEl) p1NameEl.textContent = 'Player 1 (Red)';
            if (p2NameEl) p2NameEl.textContent = mode === 'vsAI' ? 'AI Opponent (White)' : 'Player 2 (White)';
        }
    }

    /**
     * Syncs settings modal UI options with current active state.
     */
    function syncSettingsModalUI() {
        const currentMode = game.gameMode || 'vsAI';
        ['mode-ai', 'mode-online'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            if (btn.dataset.value === currentMode || (currentMode === 'vsAI' && id === 'mode-ai')) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        const currentDiff = game.aiDifficulty || 'medium';
        ['diff-easy', 'diff-medium'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            if (btn.dataset.value === currentDiff) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        const currentTheme = document.documentElement.getAttribute('data-theme') || 'default';
        ['theme-obsidian', 'theme-cyberpunk', 'theme-classic'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            if (btn.dataset.value === currentTheme) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }

    /**
     * Reads Settings modal inputs and initializes a fresh game state.
     */
    function saveSettings() {
        const modeOpt = document.querySelector('#modal-settings .select-option.selected[id^="mode"]');
        const diffOpt = document.querySelector('#modal-settings .select-option.selected[id^="diff"]');
        const themeOpt = document.querySelector('#modal-settings .select-option.selected[id^="theme"]');

        const mode = modeOpt ? modeOpt.dataset.value : 'vsAI';
        const difficulty = diffOpt ? diffOpt.dataset.value : 'medium';
        const theme = themeOpt ? themeOpt.dataset.value : 'default';

        if (window.gameAudio && checkAudio) {
            window.gameAudio.toggle(checkAudio.checked);
        }

        if (checkWakeLock) {
            if (checkWakeLock.checked) {
                enableWakeLock();
            } else {
                disableWakeLock();
            }
        }

        // Save local settings
        game.setOptions(mode, difficulty);
        if (p2NameEl) {
            p2NameEl.textContent = mode === 'vsAI' ? 'AI Opponent (White)' : 'Player 2 (White)';
        }
        
        if (aiDifficultyRow) {
            if (mode === 'vsAI') aiDifficultyRow.style.display = 'flex';
            else aiDifficultyRow.style.display = 'none';
        }

        applyTheme(theme);

        // Reset
        game.resetGame();
        buildBoardGrid();
        renderBoard();

        if (modalSettings) {
            modalSettings.classList.remove('active');
        }
        updateHud();
    }

    // Bind Button Click Events
    if (btnRoll) btnRoll.addEventListener('click', triggerPlayerRoll);
    if (btnUndo) btnUndo.addEventListener('click', () => {
        game.undoMove();
        renderBoard();
    });
    if (btnEndTurn) btnEndTurn.addEventListener('click', handleEndTurn);

    // Modal Control Triggers
    if (btnSettings && modalSettings) {
        btnSettings.addEventListener('click', () => {
            syncSettingsModalUI();
            modalSettings.classList.add('active');
        });
    }
    if (closeSettings && modalSettings) {
        closeSettings.addEventListener('click', () => {
            modalSettings.classList.remove('active');
        });
    }
    
    // settings save block
    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            const modeOpt = document.querySelector('#modal-settings .select-option.selected[id^="mode"]');
            const mode = modeOpt ? modeOpt.dataset.value : 'vsAI';
            if (mode === 'online') {
                alert("For online play, please click 'Create Room' or enter a Room Code and click 'Join Room'.");
                return;
            }
            saveSettings();
        });
    }

    // Victory celebration & Rematch controls
    if (btnVictoryRematch) {
        btnVictoryRematch.addEventListener('click', () => {
            if (modalVictory) modalVictory.classList.remove('active');
            game.resetGame();
            buildBoardGrid();
            renderBoard();
        });
    }

    if (btnVictoryClose) {
        btnVictoryClose.addEventListener('click', () => {
            if (modalVictory) modalVictory.classList.remove('active');
        });
    }

    if (btnResetScore) {
        btnResetScore.addEventListener('click', () => {
            game.resetMatchScores();
            updateHud();
            if (vScoreP1) vScoreP1.textContent = '0';
            if (vScoreP2) vScoreP2.textContent = '0';
            alert("Match scores have been reset to 0 - 0.");
        });
    }

    // Multiplayer room triggers
    if (btnCreateLobby) {
        btnCreateLobby.addEventListener('click', () => {
            sendSocketMessage('create-room');
        });
    }

    if (btnJoinLobby && joinRoomCodeInput) {
        btnJoinLobby.addEventListener('click', () => {
            const code = joinRoomCodeInput.value.trim().toUpperCase();
            if (code.length !== 4) {
                alert("Please enter a valid 4-character Room Code.");
                return;
            }
            sendSocketMessage('join-room', { code });
        });
    }

    // Toggle items inside Settings modal
    const registerSelectGroup = (buttonIds) => {
        buttonIds.forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                const settingRow = btn.closest('.setting-row') || btn.parentElement;
                settingRow.querySelectorAll('.select-option').forEach(sibling => {
                    if (buttonIds.includes(sibling.id)) {
                        sibling.classList.remove('selected');
                    }
                });
                btn.classList.add('selected');
                
                // Real-time tab feedback
                if (id === 'mode-online') {
                    if (onlineSetupRow) onlineSetupRow.style.display = 'block';
                    if (aiDifficultyRow) aiDifficultyRow.style.display = 'none';
                    connectWebSocket();
                } else if (id === 'mode-ai') {
                    if (onlineSetupRow) onlineSetupRow.style.display = 'none';
                    if (aiDifficultyRow) aiDifficultyRow.style.display = 'flex';
                }
                
                if (id.startsWith('theme-')) {
                    applyTheme(btn.dataset.value);
                }
            });
        });
    };

    registerSelectGroup(['mode-ai', 'mode-online']);
    registerSelectGroup(['diff-easy', 'diff-medium']);
    registerSelectGroup(['theme-obsidian', 'theme-cyberpunk', 'theme-classic']);

    // Initial setup
    buildBoardGrid();
    renderBoard();
    setTimeout(renderBoard, 150);
});
