import { snippet, type Completion } from "@codemirror/autocomplete";

/**
 * Commands of common packages that the language package does not know (it has only a few
 * package commands: xcolor, hyperref, booktabs…). Each is written with the shape of its
 * arguments: `\braket{}{}` inserts `\braket{|}{}` with a field per `{}`/`[]` (Tab goes to
 * the next). They are offered only when the document loads the package (pedido del usuario:
 * `\ket` y `\braket` de physics no aparecían).
 */
type PackageTable = {
  /** Meant for math (ranked first inside formulas). */
  math: boolean;
  commands: string;
};

const TABLE: Record<string, PackageTable> = {
  physics: {
    math: true,
    commands: String.raw`
      \quantity{} \qty{} \pqty{} \bqty{} \vqty{} \Bqty{} \absolutevalue{} \abs{} \norm{}
      \evaluated{} \eval{} \order{} \commutator{}{} \comm{}{} \anticommutator{}{} \acomm{}{}
      \poissonbracket{}{} \pb{}{}
      \vectorbold{} \vb{} \vectorarrow{} \va{} \vectorunit{} \vu{} \dotproduct \vdot
      \crossproduct \cross \cp \gradient \grad \divergence \div \curl \laplacian
      \Tr \tr \trace \Trace \rank \erf \Res \principalvalue \PV \Re \Im
      \qq{} \qc \qcc \qif \qthen \qelse \qotherwise \qunless \qgiven \qusing \qassume
      \qsince \qlet \qfor \qall \qeven \qodd \qinteger \qand \qor \qas \qin
      \differential \dd{} \derivative{}{} \dv{}{} \partialderivative{}{} \pdv{}{}
      \variation \var{} \functionalderivative{}{} \fdv{}{}
      \ket{} \bra{} \innerproduct{}{} \braket{}{} \outerproduct{}{} \dyad{}{} \ketbra{}{}
      \expectationvalue{} \expval{} \matrixelement{}{}{} \mel{}{}{}
      \matrixquantity{} \mqty{} \pmqty{} \Pmqty{} \bmqty{} \vmqty{} \smallmatrixquantity{}
      \smqty{} \spmqty{} \sPmqty{} \sbmqty{} \svmqty{} \matrixdeterminant{} \mdet{} \smdet{}
      \identitymatrix{} \imat{} \xmatrix{}{}{} \xmat{}{}{} \zeromatrix{} \zmat{}
      \paulimatrix{} \pmat{} \diagonalmatrix{} \dmat{} \antidiagonalmatrix{} \admat{}`,
  },
  braket: {
    math: true,
    commands: String.raw`\bra{} \ket{} \braket{} \Bra{} \Ket{} \Braket{} \set{} \Set{}`,
  },
  mathtools: {
    math: true,
    commands: String.raw`
      \coloneqq \eqqcolon \Coloneqq \vcentcolon \mathclap{} \mathllap{} \mathrlap{}
      \clap{} \prescript{}{}{} \shortintertext{} \underbracket{} \overbracket{}
      \xrightarrow{} \xleftarrow{} \xLeftarrow{} \xRightarrow{} \xleftrightarrow{}
      \xLeftrightarrow{} \xmapsto{} \splitfrac{}{} \splitdfrac{}{} \cramped{}
      \DeclarePairedDelimiter{}{}{} \mathtoolsset{}`,
  },
  amsmath: {
    math: true,
    commands: String.raw`\intertext{} \tag{} \notag \nonumber \numberwithin{}{}
      \allowdisplaybreaks \xrightarrow{} \xleftarrow{} \overunderset{}{}{}`,
  },
  siunitx: {
    math: false,
    commands: String.raw`
      \SI{}{} \si{} \num{} \qty{}{} \unit{} \ang{} \numlist{} \numrange{}{} \qtyrange{}{}{}
      \SIrange{}{}{} \qtylist{}{} \SIlist{}{} \sisetup{} \tablenum{} \complexnum{}
      \complexqty{}{} \per \squared \cubed \tothe{} \raiseto{}
      \kilo \milli \micro \nano \mega \giga \centi \meter \metre \second \kilogram \gram
      \newton \joule \watt \volt \ampere \kelvin \mole \hertz \pascal \coulomb \ohm \tesla
      \electronvolt \liter \litre \degree \degreeCelsius \radian`,
  },
  cancel: { math: true, commands: String.raw`\bcancel{} \xcancel{} \cancelto{}{}` },
  esint: { math: true, commands: String.raw`\oiint \oiiint \ointctrclockwise \ointclockwise` },
  mathrsfs: { math: true, commands: String.raw`\mathscr{}` },
  dsfont: { math: true, commands: String.raw`\mathds{}` },
  xfrac: { math: true, commands: String.raw`\sfrac{}{}` },
  nicefrac: { math: true, commands: String.raw`\nicefrac{}{}` },
  tensor: { math: true, commands: String.raw`\tensor{}{} \indices{}` },
  amsthm: { math: false, commands: String.raw`\qedhere \qed \qedsymbol \newtheoremstyle{}` },
  hyperref: {
    math: false,
    commands: String.raw`\hyperref[]{} \hypersetup{} \texorpdfstring{}{} \phantomsection`,
  },
  biblatex: {
    math: false,
    commands: String.raw`\parencite{} \textcite{} \autocite{} \footcite{} \fullcite{}
      \citetitle{} \printbibheading`,
  },
  csquotes: { math: false, commands: String.raw`\enquote{} \textquote{} \blockquote{}` },
  fontspec: {
    math: false,
    commands: String.raw`\setmainfont{} \setsansfont{} \setmonofont{} \newfontfamily{}{} \fontspec{}`,
  },
  babel: { math: false, commands: String.raw`\selectlanguage{} \foreignlanguage{}{}` },
  tikz: {
    math: false,
    commands: String.raw`\draw \node \fill \filldraw \path \coordinate \clip \shade
      \foreach \usetikzlibrary{} \tikzset{} \tikz`,
  },
  pgfplots: {
    math: false,
    commands: String.raw`\addplot \addplot3 \pgfplotsset{} \legend{} \addlegendentry{}`,
  },
  geometry: { math: false, commands: String.raw`\geometry{} \newgeometry{} \restoregeometry` },
  enumitem: { math: false, commands: String.raw`\setlist{}` },
  listings: {
    math: false,
    commands: String.raw`\lstinline{} \lstset{} \lstinputlisting{}`,
  },
  minted: {
    math: false,
    commands: String.raw`\mint{}{} \mintinline{}{} \inputminted{}{} \setminted{}`,
  },
  xcolor: { math: false, commands: String.raw`\color{} \pagecolor{}` },
  subcaption: { math: false, commands: String.raw`\subcaption{} \subcaptionbox{}{}` },
  fancyhdr: {
    math: false,
    commands: String.raw`\fancyhf{} \fancyhead[]{} \fancyfoot[]{} \lhead{} \chead{} \rhead{}
      \lfoot{} \cfoot{} \rfoot{}`,
  },
  multicol: { math: false, commands: String.raw`\columnbreak` },
};

/** A package command: its label (`\braket`) and how it is inserted. */
export type PackageCommand = { label: string; template: string; pkg: string; math: boolean };

/** `\braket{}{}` → `\braket{${1}}{${2}}`; `\cross` stays as it is. */
export function commandSnippet(written: string): string {
  let field = 0;
  return written.replace(/\{\}|\[\]/g, (pair) => `${pair[0]}\${${++field}}${pair[1]}`);
}

function parseTable(): Map<string, PackageCommand[]> {
  const out = new Map<string, PackageCommand[]>();
  for (const [pkg, { math, commands }] of Object.entries(TABLE)) {
    out.set(
      pkg,
      commands
        .split(/\s+/)
        .filter(Boolean)
        .map((template) => ({
          label: template.match(/^\\[A-Za-z@]+\d?/)![0],
          template,
          pkg,
          math,
        })),
    );
  }
  return out;
}

export const PACKAGE_COMMANDS = parseTable();

/**
 * Completions for the commands of the `packages` loaded, except those the language package
 * already offers (`known`).
 */
export function packageCompletions(
  packages: Iterable<string>,
  known: (label: string) => boolean,
): (Completion & { math: boolean })[] {
  const out: (Completion & { math: boolean })[] = [];
  // A command in two loaded packages (`\ket` in physics and braket) is offered once.
  const labels = new Set<string>();
  for (const pkg of packages) {
    for (const command of PACKAGE_COMMANDS.get(pkg) ?? []) {
      if (known(command.label) || labels.has(command.label)) continue;
      labels.add(command.label);
      const template = commandSnippet(command.template);
      out.push({
        label: command.label,
        type: "function",
        detail: command.pkg,
        math: command.math,
        apply: template === command.label ? command.label : snippet(template),
      });
    }
  }
  return out;
}
