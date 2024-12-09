/**
 * Author and copyright: Stefan Haack (https://shaack.com)
 * Repository: https://github.com/shaack/cm-pgn
 * License: MIT, see file 'LICENSE'
 */
import {pgnParser} from "./parser/pgnParser.js"
import {Chess} from "chess.mjs/src/Chess.js"

function IllegalMoveException(fen, notation) {
    this.fen = fen
    this.notation = notation
    this.toString = function () {
        return "IllegalMoveException: " + fen + " => " + notation
    }
}

export class History {

    constructor(historyString = null, setUpFen = null, sloppy = false) {
        if (!historyString) {
            this.clear()
        } else {
            const parsedMoves = pgnParser.parse(historyString
                .replace(/\s\s+/g, " ")
                .replace(/\n/g, " ")
            )
            this.moves = this.traverse(parsedMoves[0], setUpFen, null, 1, sloppy)
        }
        this.setUpFen = setUpFen
    }

    clear() {
        this.moves = []
    }

    update_fen_after_null_move(fen) {
        const fenParts = fen.split(" ");
        fenParts[1] = fenParts[1] === "w" ? "b" : "w";
        fenParts[3] = "-";
        fenParts[4] = "0";
        // update turn number if the null move is for black
        fenParts[5] = fenParts[1] === "w" ? (parseInt(fenParts[5]) + 1).toString() : fenParts[5]; 
        return fenParts.join(" ");
    }

    traverse(parsedMoves, fen, parent = null, ply = 1, sloppy = false) {
        const chess = fen ? new Chess(fen) : new Chess(); // chess.js must be included in HTML
        const moves = [];
        let previousMove = parent;
    
        for (let parsedMove of parsedMoves) {
            if (parsedMove.notation) {
                const notation = parsedMove.notation.notation;
                // Handle null move
                if (notation === "--") {
                    // set the color to the next player
                    const color = chess.turn();
                    const updatedFen = this.update_fen_after_null_move(chess.fen());
                    chess.load(updatedFen);

                    const move = {
                        fen: chess.fen(),
                        color: color,
                        previous: previousMove,
                        ply: ply,
                        san: "--",
                    };
                    move.variations = [];
                    moves.push(move);
                    if (previousMove) {
                        previousMove.next = move;
                    }
                    previousMove = move;
                } else {
                    const move = chess.move(notation, { sloppy: sloppy });
                    if (move) {
                        if (previousMove) {
                            if (!move.previous) {
                                move.previous = previousMove;
                            }
                            if (!previousMove.next) {
                                previousMove.next = move;
                            }
                        } else {
                            move.previous = null;
                        }
                        move.ply = ply;
                        this.fillMoveFromChessState(move, chess);
                        if (parsedMove.nag) {
                            move.nag = parsedMove.nag[0];
                        }
                        if (parsedMove.commentBefore) {
                            move.commentBefore = parsedMove.commentBefore;
                        }
                        if (parsedMove.commentMove) {
                            move.commentMove = parsedMove.commentMove;
                        }
                        if (parsedMove.commentAfter) {
                            move.commentAfter = parsedMove.commentAfter;
                        }
                        move.variations = [];
                        const parsedVariations = parsedMove.variations;
                        if (parsedVariations.length > 0) {
                            const lastFen = moves.length > 0 ? moves[moves.length - 1].fen : fen;
                            for (let parsedVariation of parsedVariations) {
                                move.variations.push(
                                    this.traverse(parsedVariation, lastFen, previousMove, ply, sloppy)
                                );
                            }
                        }
                        move.variation = moves;
                        moves.push(move);
                        previousMove = move;
                    } else {
                        throw new IllegalMoveException(chess.fen(), notation);
                    }
                }
            }
            ply++;
        }
        return moves;
    }
    

    fillMoveFromChessState(move, chess) {
        move.fen = chess.fen()
        move.uci = move.from + move.to + (move.promotion ? move.promotion : "")
        move.variations = []
        if (chess.game_over()) {
            move.gameOver = true
            if (chess.in_draw()) {
                move.inDraw = true
            }
            if (chess.in_stalemate()) {
                move.inStalemate = true
            }
            if (chess.insufficient_material()) {
                move.insufficientMaterial = true
            }
            if (chess.in_threefold_repetition()) {
                move.inThreefoldRepetition = true
            }
            if (chess.in_checkmate()) {
                move.inCheckmate = true
            }
        }
        if (chess.in_check()) {
            move.inCheck = true
        }
    }

    /**
     * @param move
     * @return the history to the move which may be in a variation
     */
    historyToMove(move) {
        const moves = []
        let pointer = move
        moves.push(pointer)
        while (pointer.previous) {
            moves.push(pointer.previous)
            pointer = pointer.previous
        }
        return moves.reverse()
    }

    /**
     * Don't add the move, just validate, if it would be correct
     * @param notation
     * @param previous
     * @param sloppy
     * @returns {[]|{}}
     */
    validateMove(notation, previous = null, sloppy = true) {
        if (!previous) {
            if (this.moves.length > 0) {
                previous = this.moves[this.moves.length - 1]
            }
        }
        const chess = new Chess(this.setUpFen ? this.setUpFen : undefined)
        if (previous) {
            const historyToMove = this.historyToMove(previous)
            for (const moveInHistory of historyToMove) {
                if (moveInHistory.san === "--") {
                    chess.load(moveInHistory.fen)
                } else {
                    chess.move(moveInHistory)
                }
            }
        }
        const move = chess.move(notation, {sloppy: sloppy})
        if (move) {
            this.fillMoveFromChessState(move, chess)
        }
        return move
    }

    addMove(notation, previous = null, sloppy = true) {
        if (!previous) {
            if (this.moves.length > 0) {
                previous = this.moves[this.moves.length - 1]
            }
        }
        if (notation === "--") {
            const updatedFen = this.update_fen_after_null_move(previous ? previous.fen : this.setUpFen || new Chess().fen());
            const move = {
                san: "--",
                color: previous && previous.color === "w" ? "b" : "w",
                fen: updatedFen,
                ply: previous ? previous.ply + 1 : 1,
                previous: previous,
            };
            move.variation = previous ? previous.variation : this.moves;
            move.variation.push(move);
            if (previous) {
                previous.next = move;
            }
            return move;
        }

        const move = this.validateMove(notation, previous, sloppy)
        if (!move) {
            throw new Error("invalid move")
        }
        move.previous = previous
        if (previous) {
            move.ply = previous.ply + 1
            move.uci = move.from + move.to + (move.promotion ? move.promotion : "")
            if (previous.next) {
                previous.next.variations.push([])
                move.variation = previous.next.variations[previous.next.variations.length - 1]
                move.variation.push(move)
            } else {
                previous.next = move
                move.variation = previous.variation
                previous.variation.push(move)
            }
        } else {
            move.variation = this.moves
            move.ply = 1
            this.moves.push(move)
        }
        return move
    }   

	render(renderComments = true, renderNags = true) {
		const renderComment = (commentObj) => {
			// commentObj is always an object with {text, csl, cal}
			let parts = [];
			if (commentObj.csl && commentObj.csl.length > 0) {
				// Each csl entry has { color: 'R', square: 'd4' }, for example
				// Example: [%csl Rd4,Gd5]
				const cslEntries = commentObj.csl.map(entry => entry.color + entry.square).join(",");
				parts.push(`[%csl ${cslEntries}]`);
			}
			if (commentObj.cal && commentObj.cal.length > 0) {
				// Each cal entry has { color: 'R', from: 'c8', to: 'f5' }, for example
				// Example: [%cal Rc8f5,Ra8d8]
				const calEntries = commentObj.cal.map(entry => entry.color + entry.from + entry.to).join(",");
				parts.push(`[%cal ${calEntries}]`);
			}
			if (commentObj.text && commentObj.text.trim() !== "") {
				parts.push(commentObj.text.trim());
			}
			return parts.join(" ");
		};
	
		const renderVariation = (variation, needReminder = false) => {
			let result = "";
			for (let move of variation) {
				if (move.notation === "--") {
					// Null move
					result += "-- ";
					continue;
				}
				if (move.ply % 2 === 1) {
					result += Math.floor(move.ply / 2) + 1 + ". ";
				} else if (result.length === 0 || needReminder) {
					result += (move.ply / 2) + "... ";
				}
				needReminder = false;
	
				if (renderNags && move.nag) {
					result += move.nag + " ";
				}
	
				// Render comments before the move
				if (renderComments && move.commentBefore && 
					(move.commentBefore.text || move.commentBefore.csl || move.commentBefore.cal)) {
					result += "{" + renderComment(move.commentBefore) + "} ";
					needReminder = true;
				}
	
				// Render the move
				result += move.san + " ";
	
				// Render comments on the move line
				if (renderComments && move.commentMove && 
					(move.commentMove.text || move.commentMove.csl || move.commentMove.cal)) {
					result += "{" + renderComment(move.commentMove) + "} ";
					needReminder = true;
				}
	
				// Render comments after the move
				if (renderComments && move.commentAfter && 
					(move.commentAfter.text || move.commentAfter.csl || move.commentAfter.cal)) {
					result += "{" + renderComment(move.commentAfter) + "} ";
					needReminder = true;
				}
	
				// Render variations
				if (move.variations && move.variations.length > 0) {
					for (let variation of move.variations) {
						result += "(" + renderVariation(variation) + ") ";
						needReminder = true;
					}
				}
	
				result += " ";
			}
			return result;
		};
	
		let ret = renderVariation(this.moves);
		// Remove spaces before brackets
		ret = ret.replace(/\s+\)/g, ")");
		// Remove double spaces
		ret = ret.replace(/\s\s+/g, " ").trim();
		return ret;
	}

}
