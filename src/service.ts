import { ServerWritableStream, status } from "grpc";
import { IFileStreamingServiceServer } from "../proto/streamer_grpc_pb";
import { FileRequest, Chunk } from "../proto/streamer_pb";
import * as fs from "fs";

export class DefaultFileStreamingService implements IFileStreamingServiceServer {

    read(call: ServerWritableStream<FileRequest, Chunk>) {

        const path = call.request.getPath();
        const stream = fs.createReadStream(path);

        stream.on("error", err => {
            console.error(`cannot open read stream to [${path}]: ${err}`);
            call.emit("status", status.NOT_FOUND);
            call.end();
        });

        stream.on("data", (data: Buffer) => {
            stream.pause();
            const ck = new Chunk();
            ck.setChunk(data);

            call.write(ck, err => {
                if (err) {
                    console.error(`error writing chunk to peer ${call.getPeer()}: ${err}`);
                    stream.destroy(err);
                    call.emit("status", status.ABORTED);
                    call.end();
                    return;
                }

                stream.resume();
            });
        });

        stream.on("end", () => {
            call.end();
        });

        call.on("cancelled", () => {
            console.debug(`streaming call cancelled by client: ${call.getPeer()}`);
            stream.destroy();
        });
        call.on("error", err => {
            console.error(`streaming call with peer ${call.getPeer()} ran into an error: ${err}`);
            stream.destroy(err);
        });
    }
}