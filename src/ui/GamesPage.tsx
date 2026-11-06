export type GameId = "fallingLights" | "echoGhost" | "balloonPop";

interface GameCard {
  id: GameId;
  title: string;
  blurb: string;
  detail: string;
}

const GAMES: GameCard[] = [
  {
    id: "fallingLights",
    title: "Falling Lights",
    blurb: "Timing — hit the beat on two home keys",
    detail:
      "Neon targets fall toward a judgment line. Play C3 (left hand) and C5 (right hand) in the window — train two-hand timing without reading a score.",
  },
  {
    id: "echoGhost",
    title: "Echo Ghost",
    blurb: "Ear echo — hear a phrase, then replay it",
    detail:
      "Listen to a short C4–B4 melody, then play the pitches back in order. Rhythm is forgiving; memory and pitch accuracy are the game.",
  },
  {
    id: "balloonPop",
    title: "Balloon Pop",
    blurb: "Pop note and chord balloons before they drift away",
    detail:
      "Candy balloons float across the sky with note or chord labels. Play the right pitches to pop them. Choose Easy, Medium, or Hard before you start.",
  },
];

export interface GamesPageProps {
  onEnterGame: (game: GameId) => void;
}

export function GamesPage({ onEnterGame }: GamesPageProps) {
  return (
    <div className="games-page">
      <header className="games-page-header">
        <h2>Games</h2>
        <p>
          Short piano mini-games for timing, ear training, and quick note reading — separate from
          sheet-music Feedback practice.
        </p>
      </header>
      <ul className="games-list">
        {GAMES.map((game) => (
          <li key={game.id} className="games-list-item">
            <div className="games-list-copy">
              <h3>{game.title}</h3>
              <p className="games-list-blurb">{game.blurb}</p>
              <p className="games-list-detail">{game.detail}</p>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => onEnterGame(game.id)}
            >
              Play
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
