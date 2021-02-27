import {Header, TAGS} from "./Header.mjs"
import {History} from "./History.mjs"

export class Pgn {

    constructor(pgnString = "") {
        // only the header?
        const lastHeaderElement =  pgnString.trim().substr(-1) === "]" ? pgnString.length : pgnString.lastIndexOf("]\n\n") + 1
        const headerString = pgnString.substr(0, lastHeaderElement)
        const historyString = pgnString.substr(lastHeaderElement)
        this.header = new Header(headerString)
        if (this.header.tags.get(TAGS.SetUp) === "1" && this.header.tags.has(TAGS.FEN)) {
            this.history = new History(historyString, this.header.tags.get(TAGS.FEN))
        } else {
            this.history = new History(historyString)
        }
    }

    render() {
        let pgn = ""
        pgn += this.header.render()
        pgn += "\n"
        pgn += this.history.render()
        return pgn
    }

}