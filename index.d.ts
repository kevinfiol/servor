type ServbotOptions = {
    root: string;
    reload: boolean;
    fallback: string;
    credentials: Record<string, unknown> | null;
};

type ServbotServer = {
    listen: (port: number) => void;
    reload: () => void;
    close: (callback: Function) => void;
};

export default function (options: ServbotOptions): ServbotServer;