import Image from "next/image";
const icons = {
  account: ["f1109.svg", 20],
  orders: ["1f650.svg", 20],
  listings: ["43060.svg", 20],
  sales: ["d95c3.svg", 20],
  address: ["a2ed4.svg", 20],
  security: ["d0a85.svg", 20],
  search: ["85431.svg", 23],
  user: ["1ab1b.svg", 19],
  plus: ["58541.svg", 18],
  menu: ["7468e.svg", 19],
  viewed: ["813a7.svg", 19],
  clock: ["c812f.svg", 19],
  wallet: ["8cd17.svg", 19],
  saved: ["73d78.svg", 19],
  laptop: ["e4846.svg", 18],
  phone: ["caf7d.svg", 18],
  headphones: ["26eb5.svg", 18],
  books: ["2dcdb.svg", 18],
  home: ["bcc3a.svg", 18],
  camera: ["1f851.svg", 18],
  filter: ["1beb2.svg", 16],
  heart: ["5189a.svg", 20],
  heartFilled: ["13688.svg", 20],
  arrow: ["d48f5.svg", 20],
  zoom: ["f2ec7.svg", 20],
  shield: ["67cfd.svg", 18],
} as const;
export type FigmaIconName = keyof typeof icons;
export function FigmaIcon({
  name,
  dark = false,
}: {
  name: FigmaIconName;
  dark?: boolean;
}) {
  const [file, size] = icons[name];
  return (
    <Image
      src={`/figma/assets/${file}`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={dark ? "figma-icon icon-dark" : "figma-icon"}
    />
  );
}
