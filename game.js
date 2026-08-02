/**
 * Core Backgammon Game Logic Engine.
 * Handles game state, standard rules, move validation, undo/redo,
 * and the heuristic-based AI opponent.
 */
class BackgammonGame {
    constructor() {
        this.board = Array(25).fill(null).map(() => ({ count: 0, player: 0 }));
        this.bar = { 1: 0, 2: 0 };
        this.borneOff = { 1: 0, 2: 0 };
        this.scores = { 1: 0, 2: 0 };
        this.isGameOver = false;
        this.winner = 0;
        this.winType = 'single'; // 'single' (1 pt) or 'gammon' (2 pts)
        
        this.turn = 1; // 1 = Player 1 (Red/Human), 2 = Player 2 (White/AI or Human)
        this.dice = []; // Rolled values
        this.remainingMoves = []; // Array of move lengths left to play
        
        this.gameMode = 'vsAI'; // 'local', 'vsAI', or 'online'
        this.aiDifficulty = 'medium'; // 'easy' or 'medium'
        this.selectedPoint = -1; // -1 if none, "bar" if bar selected
        this.validMoves = []; // Destinations for selected point
        
        this.history = []; // History of moves in the current turn for undo
        this.moveLog = []; // Text descriptions of actions
        this.statusMessage = "Select Game Mode and Roll to Start!";
        this.isAiThinking = false;
        
        this.isOpeningRollPhase = true; // Opening roll phase flag
        this.openingRolls = { 1: null, 2: null }; // Roll value for P1 and P2
        this.openingRollTurn = 1; // Tracks who rolls next (1 or 2)
        
        // Online network synchronization hooks
        this.myPlayerId = 1; 
        this.onLocalMovePlayed = null;
        this.onLocalUndoPlayed = null;
        
        this.resetGame();
    }

    /**
     * Resets the match scores for both players to 0.
     */
    resetMatchScores() {
        this.scores = { 1: 0, 2: 0 };
    }

    /**
     * Initializes or resets the board to standard starting positions.
     */
    resetGame() {
        this.board = Array(25).fill(null).map(() => ({ count: 0, player: 0 }));
        this.bar = { 1: 0, 2: 0 };
        this.borneOff = { 1: 0, 2: 0 };
        this.isGameOver = false;
        this.winner = 0;
        this.winType = 'single';
        this.dice = [];
        this.remainingMoves = [];
        this.history = [];
        this.selectedPoint = -1;
        this.validMoves = [];
        this.isOpeningRollPhase = true;
        this.openingRolls = { 1: null, 2: null };
        this.openingRollTurn = 1;
        this.statusMessage = "Roll to start the game!";
        
        // Standard starting layout:
        // Point 1: 2 Player 2 (White)
        this.board[1] = { count: 2, player: 2 };
        // Point 6: 5 Player 1 (Red)
        this.board[6] = { count: 5, player: 1 };
        // Point 8: 3 Player 1 (Red)
        this.board[8] = { count: 3, player: 1 };
        // Point 12: 5 Player 2 (White)
        this.board[12] = { count: 5, player: 2 };
        // Point 13: 5 Player 1 (Red)
        this.board[13] = { count: 5, player: 1 };
        // Point 17: 3 Player 2 (White)
        this.board[17] = { count: 3, player: 2 };
        // Point 19: 5 Player 2 (White)
        this.board[19] = { count: 5, player: 2 };
        // Point 24: 2 Player 1 (Red)
        this.board[24] = { count: 2, player: 1 };

        this.turn = 1;
        this.dice = [];
        this.remainingMoves = [];
        this.selectedPoint = -1;
        this.validMoves = [];
        this.history = [];
        this.isOpeningRollPhase = true;
        this.openingRolls = { 1: null, 2: null };
        this.openingRollTurn = 1;
        this.moveLog = ["Game reset. Good luck!"];
        this.statusMessage = "Player 1: Roll your starting die!";
        this.isAiThinking = false;
    }

    /**
     * Set game configuration options
     */
    setOptions(mode, difficulty) {
        this.gameMode = mode;
        this.aiDifficulty = difficulty;
    }

    /**
     * Roll the dice (generates values and assigns to remainingMoves).
     */
    generateRoll() {
        if (this.isOpeningRollPhase) {
            const rollVal = Math.floor(Math.random() * 6) + 1;
            const activePlayer = this.openingRollTurn;
            this.openingRolls[activePlayer] = rollVal;

            this.history = [];
            this.selectedPoint = -1;
            this.validMoves = [];

            if (activePlayer === 1) {
                // P1 rolled. P2's turn to roll starting die.
                this.openingRollTurn = 2;
                this.dice = [rollVal, 0];
                this.statusMessage = `Player 1 rolled ${rollVal}. Player 2: Roll your starting die!`;
                this.logAction(`P1 rolled starting die: ${rollVal}`);
                return [rollVal, null];
            } else {
                // P2 rolled. Compare rolls!
                const p1Val = this.openingRolls[1];
                const p2Val = rollVal;
                this.dice = [p1Val, p2Val];

                if (p1Val === p2Val) {
                    // Tie! Reset rolls and roll again.
                    this.openingRolls = { 1: null, 2: null };
                    this.openingRollTurn = 1;
                    this.statusMessage = `Tie (both rolled ${p1Val})! Player 1: Roll again.`;
                    this.logAction(`Opening tie: both rolled ${p1Val}. Rerolling...`);
                    return [null, p2Val];
                } else {
                    // Start game!
                    this.isOpeningRollPhase = false;
                    this.turn = p1Val > p2Val ? 1 : 2;
                    this.remainingMoves = [p1Val, p2Val];
                    this.statusMessage = `P1 rolled ${p1Val}, P2 rolled ${p2Val}. P${this.turn} goes first!`;
                    this.logAction(`Opening roll finished: P1 rolled ${p1Val}, P2 rolled ${p2Val}. P${this.turn} goes first.`);
                    return [null, p2Val];
                }
            }
        } else {
            const d1 = Math.floor(Math.random() * 6) + 1;
            const d2 = Math.floor(Math.random() * 6) + 1;
            
            this.dice = [d1, d2];
            if (d1 === d2) {
                // Doubles yield 4 moves of the value
                this.remainingMoves = [d1, d1, d1, d1];
                this.logAction(`Player ${this.turn} rolled double ${d1}'s! (4 moves)`);
            } else {
                this.remainingMoves = [d1, d2];
                this.logAction(`Player ${this.turn} rolled ${d1} and ${d2}`);
            }
            
            this.history = []; // Clear current turn undo history
            this.selectedPoint = -1;
            this.validMoves = [];
            
            this.updateStatusAfterRoll();
            return this.dice;
        }
    }

    /**
     * Checks if the active player has any legal moves available.
     */
    hasLegalMoves() {
        if (this.remainingMoves.length === 0) return false;

        // If player has checkers on the bar, they must move them first
        if (this.bar[this.turn] > 0) {
            const moves = this.getValidMovesForPoint("bar");
            return moves.length > 0;
        }

        // Check if any point has a checker of the active player that can make a legal move
        for (let p = 1; p <= 24; p++) {
            if (this.board[p].player === this.turn) {
                const moves = this.getValidMovesForPoint(p);
                if (moves.length > 0) return true;
            }
        }
        return false;
    }

    /**
     * Get valid target points for a checker starting from a point.
     * @param {number|string} from - Point number 1-24, or "bar"
     */
    getValidMovesForPoint(from) {
        if (this.remainingMoves.length === 0) return [];
        
        // Rules say: If you have checkers on the bar, you CANNOT move any other checker
        if (from !== "bar" && this.bar[this.turn] > 0) {
            return [];
        }

        const validTargets = [];
        const pTurn = this.turn;
        
        // Find unique dice values to check (to avoid duplicate checks when rolling doubles)
        const uniqueMoves = [...new Set(this.remainingMoves)];

        uniqueMoves.forEach(move => {
            let to = -1;
            if (pTurn === 1) {
                // Player 1 moves descending: 24 -> 1, bears off at 0
                to = (from === "bar") ? (25 - move) : (from - move);
            } else {
                // Player 2 moves ascending: 1 -> 24, bears off at 25
                to = (from === "bar") ? move : (from + move);
            }

            // Check validity of destination
            if (pTurn === 1) {
                if (to >= 1) {
                    // Regular move on board
                    const dest = this.board[to];
                    // Open if empty, owned by us, or contains exactly 1 enemy checker (blot)
                    if (dest.player === 0 || dest.player === 1 || dest.count <= 1) {
                        validTargets.push(to);
                    }
                } else {
                    // Bearing off (to <= 0)
                    if (this.canBearOff(1)) {
                        const dist = from; // Distance to bear off from point 'from' (P1 bears off at 0)
                        if (dist === move) {
                            validTargets.push(0); // Exact roll matches point
                        } else if (move > dist) {
                            // Roll is greater than distance. Allowed only if there are no checkers on higher points.
                            let hasFurtherCheckers = false;
                            for (let p = from + 1; p <= 6; p++) {
                                if (this.board[p].player === 1 && this.board[p].count > 0) {
                                    hasFurtherCheckers = true;
                                    break;
                                }
                            }
                            if (!hasFurtherCheckers) {
                                validTargets.push(0);
                            }
                        }
                    }
                }
            } else {
                // Player 2
                if (to <= 24) {
                    // Regular move on board
                    const dest = this.board[to];
                    if (dest.player === 0 || dest.player === 2 || dest.count <= 1) {
                        validTargets.push(to);
                    }
                } else {
                    // Bearing off (to >= 25)
                    if (this.canBearOff(2)) {
                        const dist = 25 - from; // Distance to bear off from point 'from' (P2 bears off at 25)
                        if (dist === move) {
                            validTargets.push(25); // Exact roll matches point
                        } else if (move > dist) {
                            // Roll is greater than distance. Allowed only if there are no checkers on further points.
                            let hasFurtherCheckers = false;
                            for (let p = from - 1; p >= 19; p--) {
                                if (this.board[p].player === 2 && this.board[p].count > 0) {
                                    hasFurtherCheckers = true;
                                    break;
                                }
                            }
                            if (!hasFurtherCheckers) {
                                validTargets.push(25);
                            }
                        }
                    }
                }
            }
        });

        return validTargets;
    }

    /**
     * Check if a player is in bearing-off phase (all checkers in home board).
     */
    canBearOff(player) {
        // If there are checkers on the bar, bearing off is not allowed
        if (this.bar[player] > 0) return false;

        // Check if there are any checkers outside the home board
        if (player === 1) {
            // Home board is 1-6. Look at 7-24.
            for (let p = 7; p <= 24; p++) {
                if (this.board[p].player === 1 && this.board[p].count > 0) {
                    return false;
                }
            }
        } else {
            // Home board is 19-24. Look at 1-18.
            for (let p = 1; p <= 18; p++) {
                if (this.board[p].player === 2 && this.board[p].count > 0) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Executes a move from `from` to `to`. Returns true if successful.
     * @param {number|string} from - Point 1-24 or "bar"
     * @param {number} to - Point 0-25 (0 and 25 represent borne-off)
     * @param {boolean} isRemote - True if executed via network from opponent
     * @param {number|null} remoteUsedDie - Die value sent by remote player
     */
    makeMove(from, to, isRemote = false, remoteUsedDie = null) {
        // Find which die value was used
        let usedDie = remoteUsedDie;
        if (usedDie === null || usedDie === undefined) {
            if (this.turn === 1) {
                usedDie = (from === "bar") ? (25 - to) : (from - to);
            } else {
                usedDie = (from === "bar") ? to : (to - from);
            }
        }

        // For bearing off, the die used might be larger than the exact distance
        let dieIndex = this.remainingMoves.indexOf(usedDie);
        if (dieIndex === -1 && (to === 0 || to === 25)) {
            // Find a die that is larger than the exact distance
            const exactDist = (this.turn === 1) ? (from === "bar" ? 25 : from) : (from === "bar" ? 25 : (25 - from));
            let bestDie = -1;
            let bestIdx = -1;
            for (let i = 0; i < this.remainingMoves.length; i++) {
                const d = this.remainingMoves[i];
                if (d >= exactDist) {
                    if (bestDie === -1 || d < bestDie) {
                        bestDie = d;
                        bestIdx = i;
                    }
                }
            }
            if (bestIdx !== -1) {
                usedDie = bestDie;
                dieIndex = bestIdx;
            }
        }

        if (dieIndex === -1 && !isRemote) {
            return false; // Invalid move distance for local play
        }

        // If it's a remote move, ensure we consume a die if available
        if (dieIndex === -1 && isRemote) {
            dieIndex = 0; // Take available die
        }

        // Apply state changes
        let hitOpponent = false;
        const opponent = this.turn === 1 ? 2 : 1;

        // 1. Remove checker from source
        if (from === "bar") {
            if (this.bar[this.turn] > 0) this.bar[this.turn]--;
        } else if (this.board[from]) {
            this.board[from].count--;
            if (this.board[from].count <= 0) {
                this.board[from].count = 0;
                this.board[from].player = 0;
            }
        }

        // 2. Add checker to destination / handle hit
        if (to === 0 || to === 25) {
            // Borne off
            this.borneOff[this.turn]++;
            if (window.gameAudio) {
                window.gameAudio.playBearOff();
            }
        } else if (this.board[to]) {
            const dest = this.board[to];
            if (dest.player === opponent && dest.count === 1) {
                // Hit! Move opponent to bar
                this.bar[opponent]++;
                dest.player = this.turn;
                dest.count = 1;
                hitOpponent = true;
                if (window.gameAudio) {
                    window.gameAudio.playHit();
                }
            } else {
                // Normal placement
                dest.player = this.turn;
                dest.count++;
                if (window.gameAudio) {
                    window.gameAudio.playMove();
                }
            }
        }

        // 3. Consume die move
        if (dieIndex !== -1 && dieIndex < this.remainingMoves.length) {
            this.remainingMoves.splice(dieIndex, 1);
        }

        // 4. Save to history for undo
        this.history.push({
            from: from,
            to: to,
            die: usedDie,
            wasHit: hitOpponent
        });

        const fromLabel = from === "bar" ? "Bar" : `Point ${from}`;
        const toLabel = (to === 0 || to === 25) ? "Off" : `Point ${to}`;
        this.logAction(`P${this.turn} moved checker from ${fromLabel} to ${toLabel}${hitOpponent ? " (HIT opponent!)" : ""}`);

        // Reset selections
        this.selectedPoint = -1;
        this.validMoves = [];

        this.updateStatusAfterMove();

        // Online sync hook trigger
        if (this.gameMode === 'online' && !isRemote && this.onLocalMovePlayed) {
            this.onLocalMovePlayed(from, to, usedDie);
        }

        return true;
    }

    /**
     * Undoes the last move made in the current turn.
     */
    undoMove(isRemote = false, remoteDie = null) {
        if (this.history.length === 0 && !isRemote) return false;

        let lastMove = this.history.pop();
        if (!lastMove && isRemote) {
            // Fallback for remote undo if history wasn't tracked
            this.updateStatusAfterMove();
            return true;
        }

        const { from, to, die, wasHit } = lastMove;
        const usedDie = remoteDie || die;
        const opponent = this.turn === 1 ? 2 : 1;

        // 1. Return checker from destination
        if (to === 0 || to === 25) {
            if (this.borneOff[this.turn] > 0) this.borneOff[this.turn]--;
        } else if (this.board[to]) {
            this.board[to].count--;
            if (this.board[to].count <= 0) {
                this.board[to].count = 0;
                this.board[to].player = 0;
            }
        }

        // 2. Re-add to source
        if (from === "bar") {
            this.bar[this.turn]++;
        } else if (this.board[from]) {
            this.board[from].player = this.turn;
            this.board[from].count++;
        }

        // 3. Restore hit opponent checker
        if (wasHit) {
            if (this.bar[opponent] > 0) this.bar[opponent]--;
            if (this.board[to]) {
                this.board[to].player = opponent;
                this.board[to].count = 1;
            }
        }

        // 4. Restore the die move
        if (usedDie) {
            this.remainingMoves.push(usedDie);
        }

        // Reset Selection
        this.selectedPoint = -1;
        this.validMoves = [];
        
        this.logAction(`P${this.turn} undid last move`);
        this.updateStatusAfterMove();

        // Online sync hook trigger
        if (this.gameMode === 'online' && !isRemote && this.onLocalUndoPlayed) {
            this.onLocalUndoPlayed(usedDie);
        }

        if (window.gameAudio) {
            window.gameAudio.playMove();
        }
        return true;
    }

    /**
     * Switch turns between Player 1 and Player 2.
     */
    switchTurn() {
        this.turn = this.turn === 1 ? 2 : 1;
        this.dice = [];
        this.remainingMoves = [];
        this.history = [];
        this.selectedPoint = -1;
        this.validMoves = [];
        
        this.statusMessage = `Player ${this.turn}'s Turn. Roll!`;
        this.logAction(`Turn switched to Player ${this.turn}`);
    }

    /**
     * Check if someone has won the game (borne off all 15 checkers).
     * Calculates single win (+1 pt) or Gammon victory (+2 pts if opponent has 0 borne off).
     */
    checkWin() {
        if (this.isGameOver) {
            return this.winner;
        }

        let winner = 0;
        if (this.borneOff[1] >= 15) winner = 1;
        else if (this.borneOff[2] >= 15) winner = 2;

        if (winner !== 0) {
            const loser = winner === 1 ? 2 : 1;
            const isGammon = (this.borneOff[loser] === 0);
            const points = isGammon ? 2 : 1;

            this.isGameOver = true;
            this.winner = winner;
            this.winType = isGammon ? 'gammon' : 'single';
            this.scores[winner] += points;

            const winnerName = (winner === 1) ? 'Player 1' : (this.gameMode === 'vsAI' ? 'AI Opponent' : 'Player 2');
            const winTypeLabel = isGammon ? 'GAMMON VICTORY (+2 Pts)' : 'SINGLE WIN (+1 Pt)';

            this.statusMessage = `🎉 ${winnerName} Wins! ${winTypeLabel}`;

            if (window.gameAudio && typeof window.gameAudio.playVictory === 'function') {
                window.gameAudio.playVictory();
            }
            return winner;
        }

        return 0;
    }

    /**
     * Returns the pip count for both players.
     * Pip count is the sum of (checker distance to bearing off).
     */
    getPipCounts() {
        let p1 = 0;
        let p2 = 0;

        // Add checkers on bar
        p1 += this.bar[1] * 25;
        p2 += this.bar[2] * 25;

        for (let p = 1; p <= 24; p++) {
            if (this.board[p].player === 1) {
                p1 += this.board[p].count * p;
            } else if (this.board[p].player === 2) {
                p2 += this.board[p].count * (25 - p);
            }
        }

        return { 1: p1, 2: p2 };
    }

    /**
     * Logs an action in the move history.
     */
    logAction(text) {
        this.moveLog.push(text);
        if (this.moveLog.length > 50) this.moveLog.shift();
    }

    updateStatusAfterRoll() {
        if (this.checkWin() > 0) return;

        if (!this.hasLegalMoves()) {
            this.statusMessage = `Player ${this.turn} rolled but has no legal moves!`;
            this.logAction(`P${this.turn} has no legal moves!`);
        } else {
            this.statusMessage = `Player ${this.turn} rolled. Make your moves!`;
        }
    }

    updateStatusAfterMove() {
        if (this.checkWin() > 0) return;

        if (this.remainingMoves.length === 0) {
            this.statusMessage = `Turn complete. Press End Turn.`;
        } else if (!this.hasLegalMoves()) {
            this.statusMessage = `No further legal moves possible. Press End Turn.`;
            this.logAction(`P${this.turn} has no further legal moves.`);
        } else {
            this.statusMessage = `Moves remaining: ${this.remainingMoves.join(', ')}`;
        }
    }

    // =========================================================================
    // =========================== AI ENGINE ===================================
    // =========================================================================

    /**
     * Triggers the AI move sequence.
     * Computes the best moves based on search and heuristics, executing them.
     */
    triggerAiMove(onMoveComplete, onTurnComplete) {
        if (this.turn !== 2 || this.gameMode !== 'vsAI' || this.isAiThinking) return;
        this.isAiThinking = true;

        setTimeout(() => {
            // First, evaluate all possible move sequences
            const bestSequence = this.findBestAiSequence();

            if (!bestSequence || bestSequence.length === 0) {
                this.logAction("AI has no legal moves.");
                this.isAiThinking = false;
                onTurnComplete();
                return;
            }

            // Execute moves sequentially with smooth animated gliding motion
            let step = 0;
            const executeStep = () => {
                if (step < bestSequence.length) {
                    const move = bestSequence[step];
                    if (typeof window !== 'undefined' && typeof window.animateCheckerMove === 'function') {
                        window.animateCheckerMove(move.from, move.to, () => {
                            this.makeMove(move.from, move.to);
                            onMoveComplete(); // Update UI
                            step++;
                            setTimeout(executeStep, 400);
                        });
                    } else {
                        this.makeMove(move.from, move.to);
                        onMoveComplete(); // Update UI
                        step++;
                        setTimeout(executeStep, 800);
                    }
                } else {
                    this.isAiThinking = false;
                    onTurnComplete(); // Wrap up AI turn
                }
            };

            setTimeout(executeStep, 600); // delay before starting first move
        }, 1200); // initial delay before AI moves (gives time to see dice roll)
    }

    /**
     * Evaluates all permutations of moves using the current dice/remaining moves
     * and returns the optimal sequence of moves.
     */
    findBestAiSequence() {
        // Deep clone current state
        const state = {
            board: JSON.parse(JSON.stringify(this.board)),
            bar: { ...this.bar },
            borneOff: { ...this.borneOff },
            remainingMoves: [...this.remainingMoves]
        };

        const sequences = [];
        this.searchAllMovePaths(state, [], sequences);

        if (sequences.length === 0) return [];

        // Sort sequences by score (higher is better)
        sequences.sort((a, b) => b.score - a.score);

        // Under 'easy' AI difficulty, add some randomness (select from top 3 sequences)
        if (this.aiDifficulty === 'easy' && sequences.length > 1) {
            const range = Math.min(3, sequences.length);
            const index = Math.floor(Math.random() * range);
            return sequences[index].path;
        }

        return sequences[0].path;
    }

    /**
     * Recursively searches all combinations of legal moves and collects complete paths.
     */
    searchAllMovePaths(state, path, collectedSequences) {
        const movesLeft = state.remainingMoves;
        const player = 2; // AI is Player 2

        if (movesLeft.length === 0) {
            const score = this.evaluateBoardState(state);
            collectedSequences.push({ path: [...path], score });
            return;
        }

        let branchGenerated = false;

        // Rule check: if bar has checkers, AI must move off the bar first
        if (state.bar[player] > 0) {
            const uniqueMoves = [...new Set(movesLeft)];
            uniqueMoves.forEach(move => {
                const to = move; // P2 re-enters from bar (index 0) to point 'move'
                
                // Check entry legality
                if (to <= 24) {
                    const dest = state.board[to];
                    if (dest.player === 0 || dest.player === player || dest.count <= 1) {
                        // Apply move to cloned state
                        const nextState = this.cloneState(state);
                        let wasHit = false;

                        nextState.bar[player]--;
                        const destCell = nextState.board[to];
                        if (destCell.player === 1 && destCell.count === 1) {
                            nextState.bar[1]++; // opponent hit
                            wasHit = true;
                        }
                        destCell.player = player;
                        destCell.count = wasHit ? 1 : destCell.count + 1;

                        const moveIdx = nextState.remainingMoves.indexOf(move);
                        nextState.remainingMoves.splice(moveIdx, 1);

                        branchGenerated = true;
                        this.searchAllMovePaths(nextState, [...path, { from: "bar", to: to }], collectedSequences);
                    }
                }
            });
        } else {
            // Regular checkers on board
            // Find all points containing Player 2's checkers
            const p2Points = [];
            for (let p = 1; p <= 24; p++) {
                if (state.board[p].player === 2 && state.board[p].count > 0) {
                    p2Points.push(p);
                }
            }

            const uniqueMoves = [...new Set(movesLeft)];

            p2Points.forEach(from => {
                uniqueMoves.forEach(move => {
                    const to = from + move;

                    // regular board move
                    if (to <= 24) {
                        const dest = state.board[to];
                        if (dest.player === 0 || dest.player === 2 || dest.count <= 1) {
                            const nextState = this.cloneState(state);
                            let wasHit = false;

                            // remove
                            nextState.board[from].count--;
                            if (nextState.board[from].count === 0) nextState.board[from].player = 0;

                            // add
                            const destCell = nextState.board[to];
                            if (destCell.player === 1 && destCell.count === 1) {
                                nextState.bar[1]++;
                                wasHit = true;
                            }
                            destCell.player = player;
                            destCell.count = wasHit ? 1 : destCell.count + 1;

                            const moveIdx = nextState.remainingMoves.indexOf(move);
                            nextState.remainingMoves.splice(moveIdx, 1);

                            branchGenerated = true;
                            this.searchAllMovePaths(nextState, [...path, { from, to }], collectedSequences);
                        }
                    } else {
                        // Bearing off
                        if (this.canBearOffInState(state, player)) {
                            const dist = 25 - from;
                            let canBear = false;

                            if (dist === move) {
                                canBear = true;
                            } else if (move > dist) {
                                // check if no checkers are further back (closer to index 1)
                                let hasFurther = false;
                                for (let p = from - 1; p >= 19; p--) {
                                    if (state.board[p].player === 2 && state.board[p].count > 0) {
                                        hasFurther = true;
                                        break;
                                    }
                                }
                                if (!hasFurther) canBear = true;
                            }

                            if (canBear) {
                                const nextState = this.cloneState(state);
                                
                                nextState.board[from].count--;
                                if (nextState.board[from].count === 0) nextState.board[from].player = 0;
                                
                                nextState.borneOff[player]++;

                                const moveIdx = nextState.remainingMoves.indexOf(move);
                                nextState.remainingMoves.splice(moveIdx, 1);

                                branchGenerated = true;
                                this.searchAllMovePaths(nextState, [...path, { from, to: 25 }], collectedSequences);
                            }
                        }
                    }
                });
            });
        }

        // If no legal moves were branchable, score this terminal state (even if dice remain)
        if (!branchGenerated) {
            const score = this.evaluateBoardState(state);
            collectedSequences.push({ path: [...path], score });
        }
    }

    /**
     * Checks bearing off capability for a specific cloned state.
     */
    canBearOffInState(state, player) {
        if (state.bar[player] > 0) return false;
        if (player === 2) {
            for (let p = 1; p <= 18; p++) {
                if (state.board[p].player === 2 && state.board[p].count > 0) {
                    return false;
                }
            }
        } else {
            for (let p = 7; p <= 24; p++) {
                if (state.board[p].player === 1 && state.board[p].count > 0) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * deep clones the simulation board state.
     */
    cloneState(state) {
        return {
            board: state.board.map(cell => ({ ...cell })),
            bar: { ...state.bar },
            borneOff: { ...state.borneOff },
            remainingMoves: [...state.remainingMoves]
        };
    }

    /**
     * Master Backgammon Heuristic Evaluation Engine (AI is Player 2).
     * High scores indicate strongly favorable positions for Player 2.
     * Evaluates:
     * - Borne off advantage & Gammon attacks
     * - Opponent hitting & Bar control
     * - Pip Count Race differential
     * - Home Board Strength (Points 19-24) & Closed Points
     * - Prime Construction (Continuous 2..6 blocked points)
     * - Anchors in Opponent Home Board (Points 1-6)
     * - Direct / Indirect Shot Exposure calculation
     */
    evaluateBoardState(state) {
        let score = 0;

        // 1. Checkers borne off (highest priority)
        score += state.borneOff[2] * 120;
        score -= state.borneOff[1] * 110;

        // 2. Checkers on the bar (severe penalty for AI, huge reward for hitting human)
        score -= state.bar[2] * 80;
        score += state.bar[1] * 95;

        // 3. Pip Count Race Assessment
        const pip1 = this.calculatePipCount(state, 1);
        const pip2 = this.calculatePipCount(state, 2);
        const raceAdvantage = pip1 - pip2; // Positive when AI leads in race
        score += raceAdvantage * 2.0;

        // 4. Home Board Strength (Points 19-24 for AI P2) & Closed Points
        let p2HomePointsClosed = 0;
        let p1HomePointsClosed = 0;

        for (let p = 19; p <= 24; p++) {
            if (state.board[p].player === 2 && state.board[p].count >= 2) {
                p2HomePointsClosed++;
                score += 35;
                // Golden Home Board Points: 5-point (p=20) and 4-point (p=21)
                if (p === 20 || p === 21) score += 20;
            }
        }
        for (let p = 1; p <= 6; p++) {
            if (state.board[p].player === 1 && state.board[p].count >= 2) {
                p1HomePointsClosed++;
                score -= 30;
            }
        }

        // Trapped on bar bonus: if human is on bar, each closed home point multiplies danger!
        if (state.bar[1] > 0) {
            score += state.bar[1] * p2HomePointsClosed * 25;
        }

        // 5. Prime Construction (Consecutive 2+ checker points)
        let maxPrimeP2 = 0;
        let currentPrimeP2 = 0;
        for (let p = 1; p <= 24; p++) {
            if (state.board[p].player === 2 && state.board[p].count >= 2) {
                currentPrimeP2++;
                if (currentPrimeP2 > maxPrimeP2) maxPrimeP2 = currentPrimeP2;
            } else {
                currentPrimeP2 = 0;
            }
        }
        if (maxPrimeP2 >= 3) {
            score += maxPrimeP2 * maxPrimeP2 * 12; // Exponential reward for 3, 4, 5, 6-primes
        }

        // 6. Anchors in Opponent's Home Board (Points 1-6)
        for (let p = 1; p <= 6; p++) {
            if (state.board[p].player === 2 && state.board[p].count >= 2) {
                score += 30; // Defensive anchor bonus
                if (p === 5 || p === 4) score += 25; // Golden advanced anchor in enemy territory
            }
        }

        // 7. Blot Vulnerability & Shot Risk Calculation
        for (let p = 1; p <= 24; p++) {
            const cell = state.board[p];
            if (cell.player === 2) {
                // Checker advancement towards home (closer to 25 is better)
                score += cell.count * p * 0.4;

                if (cell.count === 1) {
                    // Single vulnerable checker (blot)
                    let shotsCount = 0;
                    // Check if P1 can reach this blot from behind (within 1 to 6 steps)
                    for (let step = 1; step <= 6; step++) {
                        const attackerPos = p - step;
                        if (attackerPos >= 1 && state.board[attackerPos].player === 1) {
                            shotsCount++;
                        }
                    }
                    if (state.bar[1] > 0) {
                        // P1 on bar can hit blots on points 24 down to 19
                        const entryPoint = 25 - p;
                        if (entryPoint >= 1 && entryPoint <= 6) shotsCount += state.bar[1];
                    }

                    if (shotsCount > 0) {
                        // Severe penalty for exposed blot, scaled by opponent home board strength!
                        score -= (30 + (shotsCount * 15) + (p1HomePointsClosed * 12));
                    } else {
                        // Safe single checker, minor penalty
                        score -= 5;
                    }
                }
            } else if (cell.player === 1) {
                if (cell.count === 1) {
                    // Human blot (vulnerable target for AI to hit)
                    score += 15;
                }
            }
        }

        return score;
    }

    /**
     * Helper to calculate pip count in simulated state.
     */
    calculatePipCount(state, player) {
        let pips = state.bar[player] * 25;
        for (let p = 1; p <= 24; p++) {
            if (state.board[p].player === player) {
                pips += state.board[p].count * (player === 1 ? p : (25 - p));
            }
        }
        return pips;
    }
}

// Bind to window for global access
window.BackgammonGame = BackgammonGame;
