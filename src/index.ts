import { Server, ServerCredentials } from "grpc";
import { FileStreamingServiceService } from "../proto/streamer_grpc_pb";
import { DefaultFileStreamingService } from "./service";

function createServer(): Server {
    const sv = new Server();
    sv.bind("0.0.0.0:6500", ServerCredentials.createInsecure());
    sv.addService(FileStreamingServiceService, new DefaultFileStreamingService());

    return sv;
}

function main() {
    const sv = createServer();
    sv.start();

    console.info("grpc server started on port 6500");

    const gracefulStop = (): void => {
        console.log("stopping server...");
        sv.tryShutdown(() => console.log("gRPC server stopped"));
    };
    process.on("SIGTERM", gracefulStop);
    process.on("SIGINT", gracefulStop);
}

main();