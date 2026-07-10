import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { tictactoeGameDef } from './gameDef.js';

function newClient() {
  return Client({ game: tictactoeGameDef, numPlayers: 2 });
}

describe('tictactoe gameDef', () => {
  it('AC1: a legal move on an empty cell updates G', () => {
    const client = newClient();
    client.moves.play!(0);
    expect(client.getState()?.G.cells[0]).toBe('0');
  });

  it('AC2: a move on an occupied cell is rejected and G is unchanged', () => {
    const client = newClient();
    client.moves.play!(0);
    const before = client.getState()?.G.cells.slice();
    // player 1's turn now; targeting the already-occupied cell 0.
    client.moves.play!(0);
    expect(client.getState()?.G.cells).toEqual(before);
  });

  it('AC3: a horizontal line (top row) is a win for the correct player', () => {
    const client = newClient();
    // X: 0,1,2 (win) / O: 3,4
    client.moves.play!(0); // X
    client.moves.play!(3); // O
    client.moves.play!(1); // X
    client.moves.play!(4); // O
    client.moves.play!(2); // X wins top row
    expect(client.getState()?.ctx.gameover).toEqual({ winner: '0' });
  });

  it('AC3: a vertical line (left column) is a win for the correct player', () => {
    const client = newClient();
    // X: 0,3,6 (win) / O: 1,2
    client.moves.play!(0); // X
    client.moves.play!(1); // O
    client.moves.play!(3); // X
    client.moves.play!(2); // O
    client.moves.play!(6); // X wins left column
    expect(client.getState()?.ctx.gameover).toEqual({ winner: '0' });
  });

  it('AC3: a diagonal line is a win for the correct player', () => {
    const client = newClient();
    // X: 0,4,8 (win) / O: 1,2
    client.moves.play!(0); // X
    client.moves.play!(1); // O
    client.moves.play!(4); // X
    client.moves.play!(2); // O
    client.moves.play!(8); // X wins diagonal
    expect(client.getState()?.ctx.gameover).toEqual({ winner: '0' });
  });

  it('AC4: a full board with no line is a draw', () => {
    const client = newClient();
    // X O X
    // X O O
    // O X X
    const sequence = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    for (const cell of sequence) {
      client.moves.play!(cell);
    }
    expect(client.getState()?.ctx.gameover).toEqual({ draw: true });
  });

  it('AC5: no further moves are accepted once the game is over', () => {
    const client = newClient();
    client.moves.play!(0); // X
    client.moves.play!(3); // O
    client.moves.play!(1); // X
    client.moves.play!(4); // O
    client.moves.play!(2); // X wins
    const stateAfterWin = client.getState()?.G.cells.slice();

    client.moves.play!(5); // attempted move after game-over
    expect(client.getState()?.G.cells).toEqual(stateAfterWin);
  });
});
