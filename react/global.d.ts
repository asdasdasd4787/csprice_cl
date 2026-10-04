declare const React: any;
declare const ReactDOM: any;
declare const Chart: any;
declare const THREE: any;
declare const Hammer: any;
declare const OrbitControls: any;
declare const GLTFLoader: any;

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

interface Window {
  Chart?: any;
  THREE?: any;
  CS2React: {
    Layout: any;
    classNames: (...args: any[]) => string;
    mountPage: (page: any) => void;
  };
  CS2ReactData?: any;
  CASES_DATA?: any;
  COLLECTIONS_DATA?: any;
  WEAPONS_DATA?: any;
}
