import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { OptionService } from './option.service';
import { CreateOptionGroupDto } from './dto/create-option-group.dto';
import { CreateOptionValueDto } from './dto/create-option-value.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('options')
@Controller('options')
export class OptionController {
  constructor(private readonly optionService: OptionService) {}

  // Option Groups
  @Post('groups')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create option group (admin)' })
  @HttpCode(HttpStatus.CREATED)
  createGroup(@Body() createOptionGroupDto: CreateOptionGroupDto) {
    return this.optionService.createOptionGroup(createOptionGroupDto);
  }

  @Get('groups')
  @ApiOperation({ summary: 'Get all option groups' })
  findAllGroups() {
    return this.optionService.findOptionGroups();
  }

  @Get('groups/:menuItemId')
  @ApiParam({ name: 'menuItemId', description: 'Menu item ID' })
  @ApiOperation({ summary: 'Get option groups by menu item' })
  findGroupsByMenuItem(@Param('menuItemId') menuItemId: string) {
    return this.optionService.findOptionGroups(menuItemId);
  }

  @Patch('groups/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Option group ID' })
  updateGroup(@Param('id') id: string, @Body() data: any) {
    return this.optionService.updateOptionGroup(id, data);
  }

  @Delete('groups/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Option group ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@Param('id') id: string) {
    return this.optionService.deleteOptionGroup(id);
  }

  // Option Values
  @Post('values')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create option value (admin)' })
  @HttpCode(HttpStatus.CREATED)
  createValue(@Body() createOptionValueDto: CreateOptionValueDto) {
    return this.optionService.createOptionValue(createOptionValueDto);
  }

  @Get('values/:groupId')
  @ApiParam({ name: 'groupId', description: 'Option group ID' })
  @ApiOperation({ summary: 'Get option values by group' })
  findValuesByGroup(@Param('groupId') groupId: string) {
    return this.optionService.findOptionValues(groupId);
  }

  @Patch('values/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Option value ID' })
  updateValue(@Param('id') id: string, @Body() data: any) {
    return this.optionService.updateOptionValue(id, data);
  }

  @Delete('values/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Option value ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteValue(@Param('id') id: string) {
    return this.optionService.deleteOptionValue(id);
  }
}
