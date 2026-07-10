import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtGuard extends AuthGuard("jwt") {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
